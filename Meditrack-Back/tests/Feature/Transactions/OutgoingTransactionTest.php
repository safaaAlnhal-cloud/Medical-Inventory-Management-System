<?php

namespace Tests\Feature\Transactions;

use App\Enums\TransactionStatus;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** POST and GET /transactions/outgoing: BACKEND_HANDOFF.md section 4.5 and "Batch expiry and disposal". */
class OutgoingTransactionTest extends TestCase
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

    public function test_an_issue_lowers_the_batch_and_stores_the_average_cost_as_its_unit_cost(): void
    {
        $first = $this->receive(10, 5);
        $this->receive(20, 8);                                    // Average Cost (10x5 + 20x8) / 30 = 7

        $response = $this->issue($first, ['quantity' => 4, 'recipient' => 'Emergency Dept'])->assertCreated();

        $response->assertExactJson([
            'id' => $response->json('id'), 'type' => 'outgoing', 'itemId' => $this->item->id, 'batchId' => $first->id,
            'quantity' => 4, 'date' => '2026-11-13', 'createdAt' => $response->json('createdAt'),
            'recordedBy' => $this->user->id, 'unitCost' => 7, 'recipient' => 'Emergency Dept', 'reason' => 'issue',
            'status' => 'active', 'cancelledAt' => null, 'cancelledBy' => null,
        ]);
        $this->assertSame(6, $first->fresh()->quantity);
        $this->assertSame('7.0000', $this->item->fresh()->avg_unit_cost, 'an issue never changes the average');
    }

    public function test_a_later_receipt_does_not_rewrite_an_earlier_issue(): void
    {
        $batch = $this->receive(10, 5);
        $issueId = $this->issue($batch, ['quantity' => 2])->json('id');

        $this->receive(10, 9);

        $this->assertSame('5.0000', Transaction::find($issueId)->unit_cost);
        $this->assertSame('7.2222', $this->item->fresh()->avg_unit_cost);   // (8x5 + 10x9) / 18
    }

    public function test_the_whole_batch_can_be_issued_but_not_one_more(): void
    {
        $batch = $this->receive(10, 5);

        $this->issue($batch, ['quantity' => 11])
            ->assertStatus(422)
            ->assertJsonPath('errors.quantity', 'Only 10 available in batch '.$batch->batch_number.'.');
        $this->issue($batch, ['quantity' => 10])->assertCreated();
        $this->issue($batch, ['quantity' => 1])->assertStatus(422)->assertJsonValidationErrors('batchId');
    }

    public function test_the_limit_is_the_batch_not_the_item_total(): void
    {
        $small = $this->receive(5, 5);
        $this->receive(100, 5);

        $this->issue($small, ['quantity' => 6])->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    public function test_an_expired_batch_cannot_be_issued_even_with_a_back_dated_transaction(): void
    {
        $batch = $this->receive(10, 5, date: '2026-10-01', expiryDate: '2026-11-12');

        $this->issue($batch, ['date' => '2026-11-01'])
            ->assertStatus(422)
            ->assertJsonPath('errors.batchId', fn ($m) => str_contains($m, 'expired on 12 Nov 2026'));
        $this->assertSame(10, $batch->fresh()->quantity);
    }

    public function test_a_batch_expiring_today_can_still_be_issued(): void
    {
        $batch = $this->receive(10, 5, expiryDate: '2026-11-13');

        $this->issue($batch)->assertCreated();
    }

    public function test_the_date_cannot_be_before_the_batch_was_received(): void
    {
        $batch = $this->receive(10, 5, date: '2026-11-05');

        $this->issue($batch, ['date' => '2026-11-04'])
            ->assertStatus(422)
            ->assertJsonPath('errors.date', fn ($m) => str_contains($m, '5 Nov 2026'));
        $this->issue($batch, ['date' => '2026-11-05'])->assertCreated();
    }

    public function test_a_batch_of_another_item_or_a_cancelled_receipt_is_a_422_on_batch(): void
    {
        $other = Item::factory()->create();
        $otherBatch = $this->receive(10, 5, itemId: $other->id);
        // Our item, with a batch that belongs to another item.
        $this->issue($otherBatch, ['itemId' => $this->item->id])->assertStatus(422)->assertJsonValidationErrors('batchId');

        $cancelled = $this->receive(10, 5);
        $cancelled->receipt->forceFill(['status' => TransactionStatus::Cancelled])->save();
        $this->issue($cancelled)->assertStatus(422)->assertJsonValidationErrors('batchId');

        $this->postJson('/api/transactions/outgoing', $this->payload(['batchId' => 9999]))
            ->assertStatus(422)->assertJsonValidationErrors('batchId');
    }

    public function test_invalid_fields_are_a_422_and_nothing_is_saved(): void
    {
        $batch = $this->receive(10, 5);
        $before = Transaction::count();

        foreach ([
            'itemId' => ['itemId' => 999],
            'quantity' => ['quantity' => 0],
            'date' => ['date' => '2026-11-14'],
            'recipient' => ['recipient' => ' '],
        ] as $field => $changes) {
            $this->issue($batch, $changes)->assertStatus(422)->assertJsonValidationErrors($field);
        }
        $this->postJson('/api/transactions/outgoing', $this->payload(['batchId' => null]))->assertJsonValidationErrors('batchId');

        $this->assertSame($before, Transaction::count());
        $this->assertSame(10, $batch->fresh()->quantity);
    }

    public function test_the_unit_cost_cannot_be_sent(): void
    {
        $batch = $this->receive(10, 5);

        $this->issue($batch, ['unitCost' => 999])->assertCreated()->assertJson(['unitCost' => 5]);
    }

    public function test_an_archived_item_cannot_issue_stock(): void
    {
        $batch = $this->receive(10, 5);
        $this->item->forceFill(['archived_at' => now()])->save();

        $this->issue($batch)->assertStatus(422)->assertJsonValidationErrors('itemId');
    }

    public function test_the_outgoing_list_is_newest_first_and_only_outgoing(): void
    {
        $batch = $this->receive(10, 5);
        $old = $this->issue($batch, ['recipient' => 'Ward A'])->json('id');
        $this->travel(1)->minutes();
        $new = $this->issue($batch, ['recipient' => 'Ward B'])->json('id');

        $this->getJson('/api/transactions/outgoing')->assertOk()->assertJsonPath('*.id', [$new, $old]);
        $this->getJson('/api/transactions/outgoing?search=ward b')->assertJsonPath('*.id', [$new]);
    }

    // -- helpers --------------------------------------------------------------------------

    private function receive(int $quantity, float $unitCost, string $date = '2026-11-01', ?string $expiryDate = '2027-11-01', ?int $itemId = null): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $itemId ?? $this->item->id, 'batchNumber' => 'B-'.++$counter, 'quantity' => $quantity,
            'unitCost' => $unitCost, 'date' => $date, 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    private function issue(Batch $batch, array $changes = []): TestResponse
    {
        $this->travel(1)->seconds();

        return $this->postJson('/api/transactions/outgoing', $this->payload(['itemId' => $batch->item_id, 'batchId' => $batch->id, ...$changes]));
    }

    private function payload(array $changes = []): array
    {
        return ['itemId' => $this->item->id, 'quantity' => 1, 'date' => '2026-11-13', 'recipient' => 'Ward A', ...$changes];
    }
}
