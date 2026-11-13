<?php

namespace Tests\Feature\Transactions;

use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** POST /transactions/disposal: BACKEND_HANDOFF.md, "Batch expiry and disposal". */
class DisposalTransactionTest extends TestCase
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

    public function test_a_disposal_empties_the_expired_batch_as_an_outgoing_transaction_with_no_recipient(): void
    {
        $expired = $this->receive(10, 5, expiryDate: '2026-11-12');
        $this->receive(20, 8);                                    // Average Cost (10x5 + 20x8) / 30 = 7

        $response = $this->dispose($expired, ['quantity' => 10])->assertCreated();

        $response->assertExactJson([
            'id' => $response->json('id'), 'type' => 'outgoing', 'itemId' => $this->item->id, 'batchId' => $expired->id,
            'quantity' => 10, 'date' => '2026-11-13', 'createdAt' => $response->json('createdAt'),
            'recordedBy' => $this->user->id, 'unitCost' => 7, 'recipient' => null, 'reason' => 'expired_disposal',
            'status' => 'active', 'cancelledAt' => null, 'cancelledBy' => null,
        ]);
        $this->assertSame(0, $expired->fresh()->quantity);
        $this->assertSame('7.0000', $this->item->fresh()->avg_unit_cost, 'a disposal never changes the average');
    }

    public function test_part_of_the_expired_stock_can_be_disposed_of_but_not_more_than_is_left(): void
    {
        $batch = $this->receive(10, 5, expiryDate: '2026-11-12');

        $this->dispose($batch, ['quantity' => 11])
            ->assertStatus(422)
            ->assertJsonPath('errors.quantity', 'Only 10 expired in batch '.$batch->batch_number.' awaiting disposal.');
        $this->dispose($batch, ['quantity' => 4])->assertCreated();
        $this->assertSame(6, $batch->fresh()->quantity);

        $this->dispose($batch, ['quantity' => 6])->assertCreated();
        // Disposed of once, it cannot be disposed of again: the batch is empty.
        $this->dispose($batch, ['quantity' => 1])->assertStatus(422)->assertJsonValidationErrors('batchId');
    }

    public function test_a_batch_that_has_not_expired_cannot_be_disposed_of(): void
    {
        $valid = $this->receive(10, 5, expiryDate: '2026-11-13');   // its last day: still usable
        $never = $this->receive(10, 5, expiryDate: null);

        foreach ([$valid, $never] as $batch) {
            $this->dispose($batch)
                ->assertStatus(422)
                ->assertJsonPath('errors.batchId', "Batch {$batch->batch_number} has not expired. Only expired stock can be disposed of.");
        }
        $this->assertSame(10, $valid->fresh()->quantity);
    }

    public function test_the_date_must_be_after_the_expiry_date(): void
    {
        $batch = $this->receive(10, 5, date: '2026-10-01', expiryDate: '2026-11-10');

        $this->dispose($batch, ['date' => '2026-11-10'])
            ->assertStatus(422)
            ->assertJsonPath('errors.date', fn ($m) => str_contains($m, 'must be after 10 Nov 2026'));
        $this->dispose($batch, ['date' => '2026-09-30'])
            ->assertStatus(422)
            ->assertJsonPath('errors.date', fn ($m) => str_contains($m, 'earlier than 1 Oct 2026'));
        $this->dispose($batch, ['date' => '2026-11-11'])->assertCreated();
    }

    public function test_a_recipient_or_unit_cost_sent_with_a_disposal_is_ignored(): void
    {
        $batch = $this->receive(10, 5, expiryDate: '2026-11-12');

        $this->dispose($batch, ['recipient' => 'Ward A', 'unitCost' => 999])
            ->assertCreated()
            ->assertJson(['recipient' => null, 'unitCost' => 5]);
    }

    public function test_invalid_fields_are_a_422_and_nothing_is_saved(): void
    {
        $batch = $this->receive(10, 5, expiryDate: '2026-11-12');
        $before = Transaction::count();

        foreach ([
            'itemId' => ['itemId' => 999],
            'batchId' => ['batchId' => null],
            'quantity' => ['quantity' => 0],
            'date' => ['date' => '2026-11-14'],
        ] as $field => $changes) {
            $this->dispose($batch, $changes)->assertStatus(422)->assertJsonValidationErrors($field);
        }
        $this->dispose($batch, ['quantity' => 2.5])->assertJsonValidationErrors('quantity');

        $this->assertSame($before, Transaction::count());
        $this->assertSame(10, $batch->fresh()->quantity);
    }

    public function test_a_batch_of_another_item_is_a_422_on_batch(): void
    {
        $other = Item::factory()->create();
        $otherBatch = $this->receive(10, 5, expiryDate: '2026-11-12', itemId: $other->id);

        $this->dispose($otherBatch, ['itemId' => $this->item->id])->assertStatus(422)->assertJsonValidationErrors('batchId');
        $this->assertSame(10, $otherBatch->fresh()->quantity);
    }

    public function test_an_archived_item_cannot_record_a_disposal(): void
    {
        $batch = $this->receive(10, 5, expiryDate: '2026-11-12');
        $this->item->forceFill(['archived_at' => now()])->save();

        $this->dispose($batch)->assertStatus(422)->assertJsonValidationErrors('itemId');
    }

    public function test_disposals_are_listed_with_the_issues_and_found_by_their_label(): void
    {
        $expired = $this->receive(10, 5, expiryDate: '2026-11-12');
        $valid = $this->receive(10, 5);
        $issue = $this->postJson('/api/transactions/outgoing', [
            'itemId' => $this->item->id, 'batchId' => $valid->id, 'quantity' => 1, 'date' => '2026-11-13', 'recipient' => 'Ward A',
        ])->assertCreated()->json('id');
        $this->travel(1)->minutes();
        $disposal = $this->dispose($expired)->json('id');

        $this->getJson('/api/transactions/outgoing')->assertOk()->assertJsonPath('*.id', [$disposal, $issue]);
        $this->getJson('/api/transactions/outgoing?search=DISPOSAL')->assertJsonPath('*.id', [$disposal]);
        $this->getJson('/api/transactions/outgoing?search=expired stock')->assertJsonPath('*.id', [$disposal]);
        $this->getJson('/api/transactions/outgoing?search=ward')->assertJsonPath('*.id', [$issue]);
        // The label belongs to disposals only: it never finds a receipt.
        $this->getJson('/api/transactions/incoming?search=disposal')->assertExactJson([]);
    }

    // -- helpers --------------------------------------------------------------------------

    // Received on 1 Nov, so a batch can be received while valid and be expired by 13 Nov.
    private function receive(int $quantity, float $unitCost, string $date = '2026-11-01', ?string $expiryDate = '2027-11-01', ?int $itemId = null): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $itemId ?? $this->item->id, 'batchNumber' => 'D-'.++$counter, 'quantity' => $quantity,
            'unitCost' => $unitCost, 'date' => $date, 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    private function dispose(Batch $batch, array $changes = []): TestResponse
    {
        $this->travel(1)->seconds();

        return $this->postJson('/api/transactions/disposal', [
            'itemId' => $batch->item_id, 'batchId' => $batch->id, 'quantity' => 1, 'date' => '2026-11-13', ...$changes,
        ]);
    }
}
