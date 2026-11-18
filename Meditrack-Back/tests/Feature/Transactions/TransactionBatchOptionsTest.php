<?php

namespace Tests\Feature\Transactions;

use App\Models\Batch;
use App\Models\Item;
use App\Models\Manufacturer;
use App\Models\Transaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** GET /transactions/{id}/batch-options?itemId=: BACKEND_HANDOFF.md section 4.5. */
class TransactionBatchOptionsTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-13 10:00');
        $this->item = Item::factory()->create();
        $this->actingAsStorekeeper();
    }

    public function test_the_transactions_own_quantity_counts_as_available_again(): void
    {
        $batch = $this->receive(10);
        $issue = $this->issue($batch, 4);
        $this->issue($batch, 3);

        $this->batchOptions($issue)->assertOk()->assertExactJson([[
            'id' => $batch->id, 'batchNumber' => $batch->batch_number, 'quantity' => 7,   // 10 - 3
            'expiryDate' => '2027-11-01', 'expiryStatus' => null, 'manufacturerId' => null,
        ]]);
    }

    public function test_an_incoming_transaction_cannot_issue_from_the_batch_it_received(): void
    {
        $older = $this->receive(10);
        $own = $this->receive(5);

        $this->batchOptions($this->receiptOf($own))->assertOk()->assertJsonCount(1)->assertJsonPath('0.id', $older->id);
    }

    public function test_batches_received_after_the_transaction_was_recorded_are_left_out(): void
    {
        $first = $this->receive(10);
        $issue = $this->issue($first, 2);
        $this->receive(10);                                        // recorded after the issue

        $this->batchOptions($issue)->assertJsonCount(1)->assertJsonPath('0.id', $first->id);
    }

    public function test_cancelled_receipts_and_empty_batches_are_left_out(): void
    {
        $cancelled = $this->receive(10);
        $this->patchJson('/api/transactions/'.$this->receiptOf($cancelled)->id.'/cancel')->assertOk();
        $empty = $this->receive(5);
        $this->issue($empty, 5);
        $kept = $this->receive(5);
        $issue = $this->issue($kept, 1);

        $this->batchOptions($issue)->assertJsonCount(1)->assertJsonPath('0.id', $kept->id);
    }

    public function test_an_expired_batch_offers_its_stock_only_if_the_transaction_is_dated_before_the_expiry(): void
    {
        $this->travelTo('2026-11-01 10:00');
        $expiresSoon = $this->receive(10, expiryDate: '2026-11-10');
        $otherExpired = $this->receive(10, expiryDate: '2026-11-11');
        $usable = $this->receive(10);
        $issue = $this->issue($expiresSoon, 4);                    // dated 1 Nov
        $this->travelTo('2026-11-13 10:00');                      // both have expired since

        // Dated 1 Nov, while both were usable: the stock left then, so it can be corrected.
        // Usable first, then the expired ones, nearest expiry first.
        $this->batchOptions($issue)->assertOk()
            ->assertJsonPath('*.id', [$usable->id, $expiresSoon->id, $otherExpired->id])
            ->assertJsonPath('*.quantity', [10, 10, 10])
            ->assertJsonPath('*.expiryStatus', [null, 'expired', 'expired']);

        // Dated 11 Nov: after the first batch expired, on the second one's last day.
        $issue->forceFill(['date' => '2026-11-11'])->save();
        $this->batchOptions($issue)->assertJsonPath('*.quantity', [10, 0, 10]);
    }

    public function test_the_chosen_manufacturers_batches_come_first(): void
    {
        $plain = $this->receive(10, expiryDate: '2027-01-01');
        $acme = $this->receive(10, expiryDate: '2027-06-01', manufacturer: 'Acme');
        $issue = $this->issue($plain, 1);
        $acmeId = Manufacturer::where('name', 'Acme')->value('id');

        $this->batchOptions($issue)->assertJsonPath('*.id', [$plain->id, $acme->id]);
        $this->batchOptions($issue, ['manufacturerId' => $acmeId])
            ->assertJsonPath('*.id', [$acme->id, $plain->id])
            ->assertJsonPath('0.manufacturerId', $acmeId);
    }

    public function test_another_item_can_be_asked_for(): void
    {
        $other = Item::factory()->create();
        $issue = $this->issue($this->receive(10), 1);
        $otherBatch = $this->receive(8, itemId: $other->id);
        // Received after the issue was recorded: not offered, by the replay rule.
        $this->batchOptions($issue, ['itemId' => $other->id])->assertExactJson([]);

        $later = $this->issue($this->receive(10), 1);
        $this->batchOptions($later, ['itemId' => $other->id])->assertJsonPath('*.id', [$otherBatch->id]);
    }

    public function test_archived_or_unknown_items_have_no_batches_and_bad_ids_are_rejected(): void
    {
        $issue = $this->issue($this->receive(10), 1);

        $archived = Item::factory()->archived()->create();
        $this->batchOptions($issue, ['itemId' => $archived->id])->assertExactJson([]);
        $this->batchOptions($issue, ['itemId' => 999])->assertExactJson([]);

        $this->batchOptions($issue, ['itemId' => null])->assertStatus(422)->assertJsonValidationErrors('itemId');
        $this->batchOptions($issue, ['itemId' => 'abc'])->assertStatus(422)->assertJsonValidationErrors('itemId');
        $this->batchOptions($issue, ['manufacturerId' => 'abc'])->assertStatus(422)->assertJsonValidationErrors('manufacturerId');
        $this->getJson("/api/transactions/999/batch-options?itemId={$this->item->id}")->assertNotFound();
    }

    private function receive(int $quantity, ?string $expiryDate = '2027-11-01', ?string $manufacturer = null, ?int $itemId = null): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $itemId ?? $this->item->id, 'batchNumber' => 'O-'.++$counter, 'quantity' => $quantity,
            'unitCost' => 5, 'date' => '2026-11-01', 'expiryDate' => $expiryDate, 'manufacturer' => $manufacturer,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    private function issue(Batch $batch, int $quantity): Transaction
    {
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/outgoing', [
            'itemId' => $batch->item_id, 'batchId' => $batch->id, 'quantity' => $quantity,
            'recipient' => 'Ward A', 'date' => today()->toDateString(),
        ])->assertCreated()->json('id');

        return Transaction::findOrFail($id);
    }

    private function receiptOf(Batch $batch): Transaction
    {
        return Transaction::where('batch_id', $batch->id)->where('type', 'incoming')->firstOrFail();
    }

    private function batchOptions(Transaction $transaction, array $query = []): TestResponse
    {
        $query = ['itemId' => $this->item->id, ...$query];

        return $this->getJson("/api/transactions/{$transaction->id}/batch-options?".http_build_query($query));
    }
}
