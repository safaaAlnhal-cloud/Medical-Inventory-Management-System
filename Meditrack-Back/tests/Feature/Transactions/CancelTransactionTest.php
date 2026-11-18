<?php

namespace Tests\Feature\Transactions;

use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** PATCH /transactions/{id}/cancel: BACKEND_HANDOFF.md, "Cancelled transactions". */
class CancelTransactionTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-13 10:00');
        $this->item = Item::factory()->create(['name' => 'Paracetamol']);
        $this->user = User::factory()->create();
        $this->actingAsStorekeeper($this->user);
    }

    public function test_cancelling_an_issue_returns_its_quantity_and_replays_the_average_cost(): void
    {
        // The handoff's example: 30 at $7, issue 5, 15 at $9 -> 40 at $7.75.
        $first = $this->receive(30, 7);
        $issue = $this->issue($first, 5);
        $this->receive(15, 9);
        $later = $this->issue($first, 2);                        // saved at $7.75
        $this->assertSame('7.7500', $this->item->fresh()->avg_unit_cost);

        $response = $this->cancel($issue)->assertOk();

        $response->assertJsonPath('id', $issue)
            ->assertJsonPath('status', 'cancelled')
            ->assertJsonPath('cancelledBy', $this->user->id)
            ->assertJsonPath('cancelledAt', now()->toISOString())
            ->assertJsonPath('recipient', 'Ward A');
        // (30x7 + 15x9) / 45 = 7.6667: issues never change the average, only the stock.
        $this->assertSame('7.6667', $this->item->fresh()->avg_unit_cost);
        $this->assertSame(28, $first->fresh()->quantity);
        // Other transactions are never rewritten: the later issue keeps its snapshot.
        $this->assertSame('7.7500', Transaction::find($later)->unit_cost);
    }

    public function test_cancelling_an_incoming_transaction_takes_its_batch_out_of_stock_but_keeps_the_record(): void
    {
        $this->receive(10, 4);
        $batch = $this->receive(10, 8);
        $receipt = $batch->transactions()->value('id');

        $this->cancel($receipt)
            ->assertOk()
            ->assertJsonPath('status', 'cancelled')
            ->assertJsonPath('batchId', $batch->id)
            ->assertJsonPath('supplier', null);

        $this->assertSame(0, $batch->fresh()->quantity);
        $this->assertSame('4.0000', $this->item->fresh()->avg_unit_cost);
        // Still listed, and its batch number still resolves.
        $this->getJson('/api/transactions/incoming')->assertJsonPath('0.status', 'cancelled');
        $this->getJson('/api/inventory/batches/lookup')->assertJsonFragment(['id' => $batch->id, 'batchNumber' => $batch->batch_number]);
    }

    public function test_an_incoming_transaction_cannot_be_cancelled_while_stock_issued_from_its_batch_is_active(): void
    {
        $batch = $this->receive(10, 4);
        $receipt = $batch->transactions()->value('id');
        $issue = $this->issue($batch, 3);
        $this->issue($batch, 1);

        $this->cancel($receipt)
            ->assertStatus(409)
            ->assertExactJson(['message' => "This incoming transaction cannot be cancelled because 4 from batch {$batch->batch_number} has already been issued. Cancel those outgoing transactions first."]);
        $this->assertSame(6, $batch->fresh()->quantity);

        // Once every issue from it is cancelled, it can go.
        $this->cancel($issue)->assertOk();
        $this->cancel(Transaction::where('batch_id', $batch->id)->active()->where('type', 'outgoing')->value('id'))->assertOk();
        $this->cancel($receipt)->assertOk();
        $this->assertSame(0, $batch->fresh()->quantity);
    }

    public function test_a_disposal_blocks_cancelling_the_receipt_and_cancelling_it_returns_expired_stock(): void
    {
        $batch = $this->receive(10, 4, expiryDate: '2026-11-12');
        $this->travel(1)->seconds();
        $disposal = $this->postJson('/api/transactions/disposal', [
            'itemId' => $this->item->id, 'batchId' => $batch->id, 'quantity' => 10, 'date' => '2026-11-13',
        ])->assertCreated()->json('id');

        $this->cancel($batch->transactions()->where('type', 'incoming')->value('id'))->assertStatus(409);

        $this->cancel($disposal)->assertOk()->assertJsonPath('reason', 'expired_disposal');
        $this->assertSame(10, $batch->fresh()->expiredQuantity());
    }

    public function test_a_transaction_can_be_cancelled_only_once(): void
    {
        $issue = $this->issue($this->receive(10, 4), 3);
        $this->cancel($issue)->assertOk();

        $this->cancel($issue)
            ->assertStatus(409)
            ->assertExactJson(['message' => 'This transaction has already been cancelled.']);
        $this->assertSame(10, Batch::first()->quantity);
    }

    public function test_the_transactions_of_an_archived_item_cannot_be_cancelled(): void
    {
        $issue = $this->issue($this->receive(10, 4), 3);
        $this->item->forceFill(['archived_at' => now()])->save();

        $this->cancel($issue)
            ->assertStatus(409)
            ->assertExactJson(['message' => 'This transaction belongs to "Paracetamol", which is deactivated. Reactivate the item to change its transactions.']);
        $this->assertTrue(Transaction::find($issue)->isActive());
    }

    public function test_any_signed_in_user_can_cancel_and_an_unknown_id_is_404(): void
    {
        $issue = $this->issue($this->receive(10, 4), 3);

        $this->cancel(999)->assertNotFound();

        $admin = User::factory()->create();
        $this->actingAsAdmin($admin);
        $this->cancel($issue)->assertOk()->assertJsonPath('cancelledBy', $admin->id)
            ->assertJsonPath('recordedBy', $this->user->id);
    }

    public function test_a_guest_cannot_cancel(): void
    {
        $issue = $this->issue($this->receive(10, 4), 3);
        $this->app['auth']->forgetGuards();

        $this->cancel($issue)->assertUnauthorized();
    }

    private function receive(int $quantity, float $unitCost, ?string $expiryDate = '2027-11-01'): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $this->item->id, 'batchNumber' => 'C-'.++$counter, 'quantity' => $quantity,
            'unitCost' => $unitCost, 'date' => '2026-11-01', 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    /** @return int the outgoing transaction's id */
    private function issue(Batch $batch, int $quantity): int
    {
        $this->travel(1)->seconds();

        return $this->postJson('/api/transactions/outgoing', [
            'itemId' => $batch->item_id, 'batchId' => $batch->id, 'quantity' => $quantity,
            'recipient' => 'Ward A', 'date' => '2026-11-13',
        ])->assertCreated()->json('id');
    }

    private function cancel(int $id): TestResponse
    {
        $this->travel(1)->seconds();

        return $this->patchJson("/api/transactions/{$id}/cancel");
    }
}
