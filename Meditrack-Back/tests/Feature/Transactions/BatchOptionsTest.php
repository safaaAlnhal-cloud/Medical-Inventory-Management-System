<?php

namespace Tests\Feature\Transactions;

use App\Enums\ExpiryStatus;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Manufacturer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /inventory/{item}/batch-options?manufacturerId=: the batch list of the Outgoing form. */
class BatchOptionsTest extends TestCase
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

    public function test_nearest_expiry_first_batches_that_never_expire_after_them_and_expired_last(): void
    {
        $never = $this->receive('NEVER', null);
        $late = $this->receive('LATE', '2027-06-01');
        $expired = $this->receive('EXPIRED', '2026-11-01', date: '2026-10-01');
        $soon = $this->receive('SOON', '2026-11-20');

        $this->getJson("/api/inventory/{$this->item->id}/batch-options")
            ->assertOk()
            ->assertJsonPath('*.batchNumber', ['SOON', 'LATE', 'NEVER', 'EXPIRED'])
            ->assertJsonPath('0', [
                'id' => $soon->id, 'batchNumber' => 'SOON', 'quantity' => 10, 'expiryDate' => '2026-11-20',
                'expiryStatus' => 'expiring_soon', 'manufacturerId' => null,
            ])
            ->assertJsonPath('3.quantity', 0)              // expired: listed, but nothing can be issued
            ->assertJsonPath('3.expiryStatus', 'expired');
    }

    public function test_the_chosen_manufacturer_comes_first_then_the_others(): void
    {
        $this->receive('NOVA-LATE', '2027-06-01', 'Nova Pharma');
        $this->receive('MEDICA-SOON', '2026-12-01', 'Medica Labs');
        $this->receive('NOVA-SOON', '2027-01-01', 'Nova Pharma');
        $this->receive('NONE', '2026-11-25');
        $nova = Manufacturer::where('name', 'Nova Pharma')->value('id');

        $this->getJson("/api/inventory/{$this->item->id}/batch-options?manufacturerId={$nova}")
            ->assertJsonPath('*.batchNumber', ['NOVA-SOON', 'NOVA-LATE', 'NONE', 'MEDICA-SOON']);
    }

    public function test_an_expired_batch_of_the_chosen_manufacturer_still_comes_last(): void
    {
        $this->receive('NOVA-EXPIRED', '2026-11-01', 'Nova Pharma', date: '2026-10-01');
        $this->receive('OTHER', '2027-01-01');
        $nova = Manufacturer::where('name', 'Nova Pharma')->value('id');

        $this->getJson("/api/inventory/{$this->item->id}/batch-options?manufacturerId={$nova}")
            ->assertJsonPath('*.batchNumber', ['OTHER', 'NOVA-EXPIRED']);
    }

    public function test_empty_and_cancelled_batches_are_left_out(): void
    {
        $used = $this->receive('USED', '2027-01-01');
        $this->postJson('/api/transactions/outgoing', ['itemId' => $this->item->id, 'batchId' => $used->id, 'quantity' => 10, 'date' => '2026-11-13', 'recipient' => 'Ward'])->assertCreated();
        $this->receive('KEPT', '2027-01-01');

        $this->getJson("/api/inventory/{$this->item->id}/batch-options")->assertJsonPath('*.batchNumber', ['KEPT']);
    }

    public function test_an_archived_item_has_no_options_and_an_unknown_item_is_404(): void
    {
        $this->receive('B-1', '2027-01-01');
        $this->item->forceFill(['archived_at' => now()])->save();

        $this->getJson("/api/inventory/{$this->item->id}/batch-options")->assertOk()->assertExactJson([]);
        $this->getJson('/api/inventory/999/batch-options')->assertNotFound();
        $this->getJson("/api/inventory/{$this->item->id}/batch-options?manufacturerId=abc")->assertStatus(422);
    }

    public function test_expiry_status_follows_today(): void
    {
        $batch = new Batch(['expiry_date' => '2026-12-13']);   // exactly 30 days away
        $this->assertSame(ExpiryStatus::ExpiringSoon, $batch->expiryStatus());

        $this->travelTo('2026-11-12');
        $this->assertNull($batch->expiryStatus(), '31 days away');

        $this->travelTo('2026-12-13');
        $this->assertSame(ExpiryStatus::ExpiringSoon, $batch->expiryStatus(), 'its last day');

        $this->travelTo('2026-12-14');
        $this->assertTrue($batch->isExpired());
        $this->assertNull((new Batch(['expiry_date' => null]))->expiryStatus());
    }

    private function receive(string $number, ?string $expiryDate, ?string $manufacturer = null, string $date = '2026-11-10'): Batch
    {
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $this->item->id, 'batchNumber' => $number, 'quantity' => 10, 'unitCost' => 5,
            'date' => $date, 'expiryDate' => $expiryDate, 'manufacturer' => $manufacturer,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }
}
