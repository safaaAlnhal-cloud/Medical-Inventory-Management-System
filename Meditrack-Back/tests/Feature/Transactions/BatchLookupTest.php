<?php

namespace Tests\Feature\Transactions;

use App\Enums\TransactionStatus;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Manufacturer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /inventory/batches/lookup: BACKEND_HANDOFF.md section 4.4. */
class BatchLookupTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_batch_is_listed_even_used_up_cancelled_or_of_an_archived_item(): void
    {
        $this->travelTo('2026-11-13 10:00');
        $this->actingAsStorekeeper();
        $item = Item::factory()->create();
        $archived = Item::factory()->create();

        $used = $this->receive($item, 'USED', 'Nova Pharma');
        $this->postJson('/api/transactions/outgoing', ['itemId' => $item->id, 'batchId' => $used->id, 'quantity' => 10, 'date' => '2026-11-13', 'recipient' => 'Ward'])->assertCreated();
        $cancelled = $this->receive($item, 'CANCELLED');
        $cancelled->receipt->forceFill(['status' => TransactionStatus::Cancelled])->save();
        $old = $this->receive($archived, 'OLD');
        $archived->forceFill(['archived_at' => now()])->save();

        $this->getJson('/api/inventory/batches/lookup')
            ->assertOk()
            ->assertExactJson([
                ['id' => $used->id, 'itemId' => $item->id, 'batchNumber' => 'USED', 'manufacturerId' => Manufacturer::where('name', 'Nova Pharma')->value('id')],
                ['id' => $cancelled->id, 'itemId' => $item->id, 'batchNumber' => 'CANCELLED', 'manufacturerId' => null],
                ['id' => $old->id, 'itemId' => $archived->id, 'batchNumber' => 'OLD', 'manufacturerId' => null],
            ]);
    }

    public function test_it_needs_a_signed_in_user(): void
    {
        $this->getJson('/api/inventory/batches/lookup')->assertUnauthorized();
    }

    private function receive(Item $item, string $number, ?string $manufacturer = null): Batch
    {
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $item->id, 'batchNumber' => $number, 'quantity' => 10, 'unitCost' => 5,
            'date' => '2026-11-10', 'expiryDate' => '2027-11-10', 'manufacturer' => $manufacturer,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }
}
