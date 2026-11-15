<?php

namespace Tests\Feature\Items;

use App\Models\Batch;
use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * PATCH /inventory/{item}/archive and /restore, GET /inventory/{item}/archive-history:
 * BACKEND_HANDOFF.md "Archived items" (section 3) and section 4.4.
 */
class ArchiveItemsTest extends TestCase
{
    use RefreshDatabase;

    private User $omar;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-13 10:00');
        $this->omar = User::factory()->create();
        $this->item = Item::factory()->create(['name' => 'Syringes 5ml']);
        $this->actingAsStorekeeper($this->omar);
    }

    // ---- Archive -------------------------------------------------------------------------------

    public function test_an_item_with_no_stock_is_archived_with_its_reason(): void
    {
        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => '  Discontinued by the supplier '])
            ->assertOk()
            ->assertJson([
                'id' => $this->item->id, 'archived' => true, 'archivedAt' => now()->toISOString(),
                'archiveReason' => 'Discontinued by the supplier', 'archivedBy' => $this->omar->id, 'archiveHistoryCount' => 1,
            ]);

        $this->assertDatabaseHas('item_archivals', [
            'item_id' => $this->item->id, 'reason' => 'Discontinued by the supplier', 'archived_by' => $this->omar->id, 'restored_at' => null,
        ]);
        $this->assertSame([], $this->getJson('/api/inventory')->json());
    }

    public function test_the_reason_is_required_and_at_most_500_characters(): void
    {
        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => '   '])
            ->assertUnprocessable()
            ->assertJsonPath('errors.reason', 'Please enter the reason for deactivating this item.');
        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => str_repeat('a', 501)])
            ->assertUnprocessable()
            ->assertJsonPath('errors.reason', 'The reason may not be longer than 500 characters.');

        $this->assertFalse($this->item->fresh()->isArchived());
    }

    public function test_an_item_with_available_or_expired_stock_is_not_archived(): void
    {
        $batch = $this->receive(5, '2027-01-01');
        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => 'X'])
            ->assertConflict()
            ->assertJsonPath('message', '"Syringes 5ml" still has 5 in stock, so it cannot be deactivated yet. Issue or correct the remaining stock first.');

        $batch->forceFill(['expiry_date' => '2026-11-12'])->save();         // the same stock, expired since
        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => 'X'])
            ->assertConflict()
            ->assertJsonPath('message', '"Syringes 5ml" still has 5 expired in stock awaiting disposal, so it cannot be deactivated yet. Record the disposal first.');

        $this->assertFalse($this->item->fresh()->isArchived());
        $this->assertDatabaseCount('item_archivals', 0);
    }

    public function test_an_item_whose_stock_was_all_issued_can_be_archived(): void
    {
        $batch = $this->receive(5, '2027-01-01');
        $this->postJson('/api/transactions/outgoing', [
            'itemId' => $this->item->id, 'batchId' => $batch->id, 'quantity' => 5, 'date' => '2026-11-13', 'recipient' => 'Ward A',
        ])->assertCreated();

        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => 'Used up'])->assertOk();
    }

    public function test_an_archived_item_is_not_archived_twice(): void
    {
        $this->archive('First');

        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => 'Again'])
            ->assertConflict()
            ->assertJsonPath('message', 'This item is already deactivated.');
        $this->assertDatabaseCount('item_archivals', 1);
    }

    // ---- Restore -------------------------------------------------------------------------------

    public function test_restoring_completes_the_record_and_brings_the_item_back(): void
    {
        $this->archive('Discontinued');
        $admin = User::factory()->admin()->create();
        $this->actingAsAdmin($admin);

        $this->patchJson("/api/inventory/{$this->item->id}/restore")
            ->assertOk()
            ->assertJson(['archived' => false, 'archivedAt' => null, 'archiveReason' => null, 'archivedBy' => null, 'archiveHistoryCount' => 1]);

        $this->assertDatabaseHas('item_archivals', ['item_id' => $this->item->id, 'restored_by' => $admin->id, 'restored_at' => now()]);
        $this->assertSame([$this->item->id], $this->getJson('/api/inventory')->json('*.id'));
    }

    public function test_an_active_item_is_not_restored_and_a_name_clash_blocks_the_restore(): void
    {
        $this->patchJson("/api/inventory/{$this->item->id}/restore")
            ->assertConflict()
            ->assertJsonPath('message', 'This item is not deactivated.');

        $this->archive('Old');
        $twin = Item::factory()->create(['name' => 'SYRINGES 5ML']);
        $this->patchJson("/api/inventory/{$this->item->id}/restore")
            ->assertConflict()
            ->assertJsonPath('message', 'An active item named "Syringes 5ml" already exists. Rename that item before reactivating this one.');

        $twin->update(['name' => 'Syringes 5ml (new)']);
        $this->patchJson("/api/inventory/{$this->item->id}/restore")->assertOk();
    }

    // ---- History -------------------------------------------------------------------------------

    public function test_the_history_lists_every_archiving_newest_first(): void
    {
        $this->getJson("/api/inventory/{$this->item->id}/archive-history")->assertOk()->assertExactJson([]);

        $this->archive('First time');
        $this->travel(1)->days();
        $this->patchJson("/api/inventory/{$this->item->id}/restore")->assertOk();
        $this->travel(1)->days();
        $this->archive('Second time');

        $history = $this->getJson("/api/inventory/{$this->item->id}/archive-history")->assertOk();
        $history->assertJsonCount(2)
            ->assertJsonPath('0.reason', 'Second time')
            ->assertJsonPath('0.restoredAt', null)
            ->assertJsonPath('1.reason', 'First time')
            ->assertJsonPath('1.archivedBy', $this->omar->id)
            ->assertJsonPath('1.restoredBy', $this->omar->id)
            // 10:00 in Gaza (UTC+2) is 08:00 UTC: timestamps are always sent in UTC.
            ->assertJsonPath('1.restoredAt', '2026-11-14T08:00:00.000000Z');
        $this->getJson('/api/inventory/archived')->assertJsonPath('0.archiveHistoryCount', 2);
        $this->getJson('/api/inventory/999/archive-history')->assertNotFound();
    }

    // ---- Helpers -------------------------------------------------------------------------------

    private function archive(string $reason): void
    {
        $this->patchJson("/api/inventory/{$this->item->id}/archive", ['reason' => $reason])->assertOk();
    }

    private function receive(int $quantity, ?string $expiryDate): Batch
    {
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $this->item->id, 'batchNumber' => 'B-1', 'quantity' => $quantity, 'unitCost' => 2,
            'date' => '2026-11-01', 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }
}
