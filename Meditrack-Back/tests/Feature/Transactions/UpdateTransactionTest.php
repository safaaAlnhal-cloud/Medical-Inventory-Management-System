<?php

namespace Tests\Feature\Transactions;

use App\Models\Batch;
use App\Models\Item;
use App\Models\Manufacturer;
use App\Models\Transaction;
use App\Models\TransactionRevision;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * PUT /transactions/{id} and GET /transactions/{id}/revisions:
 * BACKEND_HANDOFF.md, "Editing transactions" and "Edit history".
 */
class UpdateTransactionTest extends TestCase
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

    // ---- Outgoing stays outgoing ----

    public function test_an_issue_can_be_corrected_and_keeps_its_unit_cost_snapshot(): void
    {
        $batch = $this->receive(20, 5);
        $issue = $this->issue($batch, 4);
        $this->receive(10, 8);                                      // average now 6

        $response = $this->edit($issue, ['quantity' => 6, 'recipient' => 'Ward B'])->assertOk();

        $response->assertJsonPath('quantity', 6)
            ->assertJsonPath('recipient', 'Ward B')
            ->assertJsonPath('unitCost', 5)                         // only quantity and recipient changed
            ->assertJsonPath('recordedBy', $this->user->id)
            ->assertJsonPath('revisionsCount', 1);
        $this->assertSame(14, $batch->fresh()->quantity);
    }

    public function test_its_own_quantity_counts_as_available_but_not_more(): void
    {
        $batch = $this->receive(10, 5);
        $issue = $this->issue($batch, 4);
        $this->issue($batch, 3);

        $this->edit($issue, ['quantity' => 8])
            ->assertStatus(422)
            ->assertJsonPath('errors.quantity', "Only 7 available in batch {$batch->batch_number}.");
        $this->edit($issue, ['quantity' => 7])->assertOk();
        $this->assertSame(0, $batch->fresh()->quantity);
    }

    public function test_it_can_move_to_another_batch_received_before_it_but_not_after(): void
    {
        $first = $this->receive(10, 5);
        $second = $this->receive(10, 5);
        $issue = $this->issue($first, 4);
        $later = $this->receive(10, 5);

        $this->edit($issue, ['batchId' => $later->id])
            ->assertStatus(422)
            ->assertJsonPath('errors.batchId', "Batch {$later->batch_number} was received after this transaction was recorded, so the transaction cannot issue stock from it.");

        $this->edit($issue, ['batchId' => $second->id])->assertOk();
        $this->assertSame(10, $first->fresh()->quantity);
        $this->assertSame(6, $second->fresh()->quantity);
    }

    public function test_the_batch_must_have_an_active_receipt_for_that_item_and_the_date_follow_it(): void
    {
        $batch = $this->receive(10, 5, date: '2026-11-05');
        $issue = $this->issue($batch, 4);
        $other = Item::factory()->create();
        $foreign = $this->receive(10, 5, itemId: $other->id);

        $this->edit($issue, ['batchId' => $foreign->id])->assertStatus(422)->assertJsonPath('errors.batchId', 'The selected batch has no stock for this item.');
        $this->edit($issue, ['batchId' => 999])->assertStatus(422)->assertJsonValidationErrors('batchId');
        $this->edit($issue, ['date' => '2026-11-04'])
            ->assertStatus(422)
            ->assertJsonPath('errors.date', "The date cannot be earlier than 5 Nov 2026, when batch {$batch->batch_number} was received.");
    }

    public function test_moving_an_issue_to_another_item_takes_that_items_average_cost(): void
    {
        $batch = $this->receive(10, 5);
        $issue = $this->issue($batch, 4);
        $other = Item::factory()->create();
        $otherBatch = $this->receive(10, 9, itemId: $other->id);
        // That batch was received after the issue was recorded, so the issue cannot move onto it.
        $this->edit($issue, ['itemId' => $other->id, 'batchId' => $otherBatch->id])->assertStatus(422)->assertJsonValidationErrors('batchId');

        $early = Item::factory()->create();
        $earlyBatch = Batch::find($this->receive(10, 9, itemId: $early->id)->id);
        $laterIssue = $this->issue($batch, 1);

        $this->edit($laterIssue, ['itemId' => $early->id, 'batchId' => $earlyBatch->id])
            ->assertOk()
            ->assertJsonPath('itemId', $early->id)
            ->assertJsonPath('unitCost', 9);
        $this->assertSame(6, $batch->fresh()->quantity);
        $this->assertSame(9, $earlyBatch->fresh()->quantity);
        $this->assertEquals(['itemId' => $this->item->id, 'batchId' => $batch->id, 'unitCost' => 5],
            TransactionRevision::where('transaction_id', $laterIssue)->first()->old_values);
    }

    // ---- Expired batches (decided 2026-11-17: judged by the transaction's date) ----

    public function test_an_issue_dated_before_its_batch_expired_can_still_be_raised(): void
    {
        $this->travelTo('2026-11-01 10:00');
        $batch = $this->receive(10, 5, date: '2026-11-01', expiryDate: '2026-11-10');
        $issue = $this->issue($batch, 4, date: '2026-11-01');
        $this->travelTo('2026-11-13 10:00');                         // expired since

        // 6 boxes really left on 1 Nov, while the batch was usable: the record is corrected.
        $this->edit($issue, ['quantity' => 6])->assertOk();
        $this->assertSame(4, $batch->fresh()->quantity);

        // But it cannot be dated after the expiry: that would be issuing expired stock.
        $this->edit($issue, ['date' => '2026-11-11'])
            ->assertStatus(422)
            ->assertJsonPath('errors.date', "Batch {$batch->batch_number} expired on 10 Nov 2026. Stock issued from it must be dated on or before that day.");
    }

    public function test_an_issue_can_move_to_an_expired_batch_only_if_dated_before_its_expiry(): void
    {
        $this->travelTo('2026-11-01 10:00');
        $expired = $this->receive(10, 5, date: '2026-11-01', expiryDate: '2026-11-05');
        $usable = $this->receive(10, 5, date: '2026-11-01');
        $this->travelTo('2026-11-03 10:00');
        $early = $this->issue($usable, 2, date: '2026-11-03');
        $this->travelTo('2026-11-08 10:00');
        $late = $this->issue($usable, 2, date: '2026-11-08');

        $this->edit($early, ['batchId' => $expired->id])->assertOk();
        $this->edit($late, ['batchId' => $expired->id])->assertStatus(422)->assertJsonValidationErrors('date');
    }

    // ---- Incoming stays incoming ----

    public function test_editing_a_receipt_replays_the_average_but_never_rewrites_issues(): void
    {
        // The handoff's example: 10 at $5 and 20 at $8, issue 5 (saved at $7).
        $first = $this->receive(10, 5);
        $this->receive(20, 8);
        $issue = $this->issue($first, 5);

        $this->edit($this->receiptOf($first), ['unitCost' => 6])->assertOk()->assertJsonPath('unitCost', 6);

        $this->assertSame('7.3333', $this->item->fresh()->avg_unit_cost);
        $this->assertSame('7.0000', Transaction::find($issue)->unit_cost);
        $this->assertSame('6.0000', $first->fresh()->unit_cost, 'the batch follows the receipt');
    }

    public function test_the_batch_record_follows_the_receipt_and_keeps_its_id(): void
    {
        $batch = $this->receive(10, 5);
        $receipt = $this->receiptOf($batch);

        $this->edit($receipt, [
            'batchNumber' => 'NEW-1', 'quantity' => 12, 'supplier' => 'MedSupply', 'manufacturer' => 'Nova Pharma',
            'expiryDate' => '2028-01-01', 'manufacturingDate' => '2026-01-01',
        ])->assertOk()
            ->assertJsonPath('batchId', $batch->id)
            ->assertJsonPath('supplier', 'MedSupply')
            ->assertJsonPath('expiryDate', '2028-01-01');

        $nova = Manufacturer::where('name', 'Nova Pharma')->firstOrFail();
        $batch->refresh();
        $this->assertSame(['NEW-1', 12, $nova->id], [$batch->batch_number, $batch->quantity, $batch->manufacturer_id]);
    }

    public function test_a_receipt_with_issued_stock_keeps_its_item_enough_quantity_and_an_early_date(): void
    {
        $batch = $this->receive(10, 5, date: '2026-11-01');
        $receipt = $this->receiptOf($batch);
        $this->issue($batch, 3, date: '2026-11-04');
        $this->issue($batch, 2, date: '2026-11-06');
        $other = Item::factory()->create();

        $this->edit($receipt, ['itemId' => $other->id])
            ->assertStatus(409)
            ->assertJsonPath('errors.itemId', "The item cannot be changed because 5 from batch {$batch->batch_number} has already been issued. Cancel those outgoing transactions first.");
        $this->edit($receipt, ['quantity' => 4])
            ->assertStatus(409)
            ->assertJsonPath('errors.quantity', "The quantity cannot be less than 5, which has already been issued from batch {$batch->batch_number}.");
        $this->edit($receipt, ['date' => '2026-11-05'])
            ->assertStatus(422)
            ->assertJsonPath('errors.date', "The date cannot be later than 4 Nov 2026, when stock from batch {$batch->batch_number} was first issued.");

        $this->edit($receipt, ['quantity' => 5, 'date' => '2026-11-04'])->assertOk();
        $this->assertSame(0, $batch->fresh()->quantity);
    }

    public function test_the_batch_number_must_be_free_for_the_item_and_manufacturer(): void
    {
        $taken = $this->receive(10, 5);
        $batch = $this->receive(10, 5);

        $this->edit($this->receiptOf($batch), ['batchNumber' => strtolower($taken->batch_number)])
            ->assertStatus(409)
            ->assertJsonValidationErrors('batchNumber');
        // Its own number is not a clash, and another manufacturer may use the same number.
        $this->edit($this->receiptOf($batch), ['batchNumber' => $batch->batch_number])->assertOk();
        $this->edit($this->receiptOf($batch), ['batchNumber' => $taken->batch_number, 'manufacturer' => 'Acme'])->assertOk();
    }

    public function test_the_expiry_date_is_checked_against_the_date_only_when_one_of_them_changes(): void
    {
        $this->travelTo('2026-11-01 10:00');
        $batch = $this->receive(10, 5, date: '2026-11-01', expiryDate: '2026-11-05');
        $receipt = $this->receiptOf($batch);
        $this->travelTo('2026-11-13 10:00');

        $this->edit($receipt, ['date' => '2026-11-06'])
            ->assertStatus(422)
            ->assertJsonPath('errors.expiryDate', 'Expiry date cannot be before the transaction date: expired stock cannot be received.');
        // An old receipt whose batch has expired since can still be corrected.
        $this->edit($receipt, ['supplier' => 'Late fix'])->assertOk();
    }

    // ---- Changing the type ----

    public function test_a_receipt_turned_into_an_issue_takes_its_batch_out_of_stock(): void
    {
        $source = $this->receive(10, 4);
        $wrong = $this->receive(5, 10);                             // average (40 + 50) / 15 = 6
        $receipt = $this->receiptOf($wrong);

        $response = $this->edit($receipt, ['type' => 'outgoing', 'batchId' => $source->id, 'quantity' => 2, 'recipient' => 'Ward A'])
            ->assertOk()
            ->assertJsonPath('type', 'outgoing')
            ->assertJsonPath('reason', 'issue')
            ->assertJsonMissingPath('supplier');

        // The snapshot is the average without its own receipt: only $source is left, at $4.
        $response->assertJsonPath('unitCost', 4);
        $this->assertSame(0, $wrong->fresh()->quantity);
        $this->assertSame(8, $source->fresh()->quantity);
        $this->getJson('/api/inventory/batches/lookup')->assertJsonFragment(['id' => $wrong->id]);
        $this->edit($receipt, ['type' => 'outgoing', 'batchId' => $wrong->id, 'quantity' => 1, 'recipient' => 'Ward A'])
            ->assertStatus(422)
            ->assertJsonPath('errors.batchId', 'The selected batch has no stock for this item.');
    }

    public function test_a_receipt_whose_stock_was_issued_cannot_become_an_issue(): void
    {
        $other = $this->receive(10, 5);
        $batch = $this->receive(10, 5);
        $this->issue($batch, 1);

        $this->edit($this->receiptOf($batch), ['type' => 'outgoing', 'batchId' => $other->id, 'recipient' => 'Ward A'])
            ->assertStatus(409)
            ->assertJsonPath('message', "This transaction cannot be changed to outgoing because 1 from batch {$batch->batch_number}, which it received, has already been issued. Cancel those outgoing transactions first.");
    }

    public function test_an_issue_turned_into_a_receipt_returns_its_stock_and_receives_a_new_batch(): void
    {
        $batch = $this->receive(10, 5);
        $issue = $this->issue($batch, 4);

        $response = $this->edit($issue, [
            'type' => 'incoming', 'quantity' => 3, 'unitCost' => 7, 'batchNumber' => 'R-1', 'expiryDate' => '2028-01-01',
        ])->assertOk()
            ->assertJsonPath('type', 'incoming')
            ->assertJsonMissingPath('recipient');

        $newBatch = Batch::findOrFail($response->json('batchId'));
        $this->assertNotSame($batch->id, $newBatch->id);
        $this->assertSame(10, $batch->fresh()->quantity);
        $this->assertSame(3, $newBatch->quantity);
        $this->assertSame('5.4615', $this->item->fresh()->avg_unit_cost);   // (10x5 + 3x7) / 13
    }

    // ---- Refused outright ----

    public function test_cancelled_transactions_disposals_and_archived_items_cannot_be_edited(): void
    {
        $batch = $this->receive(10, 5);
        $cancelled = $this->issue($batch, 1);
        $this->patchJson("/api/transactions/{$cancelled}/cancel")->assertOk();
        $this->edit($cancelled)->assertStatus(409)->assertExactJson(['message' => 'A cancelled transaction cannot be edited.']);

        $this->travelTo('2026-12-01 10:00');
        $expired = $this->receive(5, 5, date: '2026-11-01', expiryDate: '2026-11-20');
        $disposal = $this->postJson('/api/transactions/disposal', [
            'itemId' => $this->item->id, 'batchId' => $expired->id, 'quantity' => 5, 'date' => '2026-12-01',
        ])->assertCreated()->json('id');
        $this->putJson("/api/transactions/{$disposal}", ['type' => 'outgoing', 'itemId' => $this->item->id, 'batchId' => $expired->id, 'quantity' => 5, 'date' => '2026-12-01', 'recipient' => 'X'])
            ->assertStatus(409)
            ->assertExactJson(['message' => 'An expired stock disposal cannot be edited. If it is wrong, cancel it and record it again.']);

        $issue = $this->issue($batch, 1, date: '2026-12-01');
        $archived = Item::factory()->archived()->create();
        $this->edit($issue, ['itemId' => $archived->id])->assertStatus(422)->assertJsonValidationErrors('itemId');

        $this->item->forceFill(['archived_at' => now()])->save();
        $this->edit($issue)
            ->assertStatus(409)
            ->assertExactJson(['message' => 'This transaction belongs to "Paracetamol", which is deactivated. Reactivate the item to change its transactions.']);
    }

    public function test_the_request_shape_is_validated_and_unknown_ids_are_404(): void
    {
        $issue = $this->issue($this->receive(10, 5), 1);

        $this->edit($issue, ['type' => 'transfer'])->assertStatus(422)->assertJsonValidationErrors('type');
        $this->edit($issue, ['quantity' => 0, 'recipient' => '', 'date' => '2026-11-14'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['quantity', 'recipient', 'date']);
        $this->putJson('/api/transactions/999', [])->assertNotFound();
    }

    public function test_fields_that_are_never_editable_are_ignored(): void
    {
        $issue = $this->issue($this->receive(10, 5), 1);
        $other = User::factory()->create();

        $this->edit($issue, ['unitCost' => 99, 'recordedBy' => $other->id, 'status' => 'cancelled', 'supplier' => 'X'])
            ->assertOk()
            ->assertJsonPath('unitCost', 5)
            ->assertJsonPath('recordedBy', $this->user->id)
            ->assertJsonPath('status', 'active')
            ->assertJsonPath('revisionsCount', 0);
    }

    // ---- Edit history ----

    public function test_each_edit_records_only_what_changed_newest_first(): void
    {
        $batch = $this->receive(10, 5);
        $receipt = $this->receiptOf($batch);
        $this->getJson("/api/transactions/{$receipt->id}/revisions")->assertExactJson([]);

        $this->edit($receipt, ['quantity' => 8, 'unitCost' => 4.5])->assertOk();
        $this->travel(1)->minutes();
        $admin = User::factory()->create();
        $this->actingAsAdmin($admin);
        $this->edit($receipt, ['manufacturer' => 'Nova Pharma'])->assertOk();
        $editedAt = now()->toISOString();
        $this->edit($receipt)->assertOk()->assertJsonPath('revisionsCount', 2);   // nothing changed: no record

        $nova = Manufacturer::where('name', 'Nova Pharma')->value('id');
        $response = $this->getJson("/api/transactions/{$receipt->id}/revisions")->assertOk()->assertJsonCount(2);
        $response->assertJsonPath('0.editedBy', $admin->id)
            ->assertJsonPath('0.editedAt', $editedAt)
            ->assertJsonPath('0.transactionId', $receipt->id)
            ->assertJsonPath('0.oldValues', ['manufacturerId' => null])
            ->assertJsonPath('0.newValues', ['manufacturerId' => $nova])
            ->assertJsonPath('1.editedBy', $this->user->id)
            ->assertJsonPath('1.oldValues', ['quantity' => 10, 'unitCost' => 5])
            ->assertJsonPath('1.newValues', ['quantity' => 8, 'unitCost' => 4.5]);

        $this->getJson('/api/transactions/incoming')->assertJsonPath('0.revisionsCount', 2);
        $this->getJson('/api/transactions/999/revisions')->assertNotFound();
    }

    public function test_a_failed_edit_saves_nothing(): void
    {
        $batch = $this->receive(10, 5);
        $receipt = $this->receiptOf($batch);
        $this->issue($batch, 6);

        // A new manufacturer would be created, then the quantity rule fails: all rolled back.
        $this->edit($receipt, ['quantity' => 5, 'manufacturer' => 'Ghost Pharma'])->assertStatus(409);

        $this->assertDatabaseMissing('manufacturers', ['name' => 'Ghost Pharma']);
        $this->assertSame(0, TransactionRevision::count());
        $this->assertSame(4, $batch->fresh()->quantity);
    }

    // ---- Helpers ----

    private function receive(int $quantity, float $unitCost, string $date = '2026-11-01', ?string $expiryDate = '2027-11-01', ?int $itemId = null): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $itemId ?? $this->item->id, 'batchNumber' => 'E-'.++$counter, 'quantity' => $quantity,
            'unitCost' => $unitCost, 'date' => $date, 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    /** @return int the outgoing transaction's id */
    private function issue(Batch $batch, int $quantity, ?string $date = null): int
    {
        $this->travel(1)->seconds();

        return $this->postJson('/api/transactions/outgoing', [
            'itemId' => $batch->item_id, 'batchId' => $batch->id, 'quantity' => $quantity,
            'recipient' => 'Ward A', 'date' => $date ?? today()->toDateString(),
        ])->assertCreated()->json('id');
    }

    private function receiptOf(Batch $batch): Transaction
    {
        return Transaction::where('batch_id', $batch->id)->where('type', 'incoming')->firstOrFail();
    }

    /**
     * PUT with every editable field as it is now, then $changes: the form always sends them all.
     */
    private function edit(Transaction|int $transaction, array $changes = []): TestResponse
    {
        $transaction = $transaction instanceof Transaction ? $transaction : Transaction::findOrFail($transaction);
        $transaction->refresh()->load('batch.manufacturer');
        $batch = $transaction->batch;

        $current = [
            'type' => $transaction->type->value, 'itemId' => $transaction->item_id,
            'quantity' => $transaction->quantity, 'date' => $transaction->date->toDateString(),
        ];
        $current += $transaction->isIncoming()
            ? [
                'batchNumber' => $batch->batch_number, 'unitCost' => (float) $transaction->unit_cost,
                'expiryDate' => $batch->expiry_date?->toDateString(), 'supplier' => $batch->supplier,
                'manufacturer' => $batch->manufacturer?->name, 'manufacturingDate' => $batch->manufacturing_date?->toDateString(),
            ]
            : ['batchId' => $transaction->batch_id, 'recipient' => $transaction->recipient];

        $this->travel(1)->seconds();

        return $this->putJson("/api/transactions/{$transaction->id}", [...$current, ...$changes]);
    }
}
