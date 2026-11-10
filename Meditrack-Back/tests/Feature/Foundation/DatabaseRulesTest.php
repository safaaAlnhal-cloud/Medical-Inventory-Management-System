<?php

namespace Tests\Feature\Foundation;

use App\Models\Batch;
use App\Models\Item;
use App\Models\ItemBarcode;
use App\Models\Manufacturer;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The rules the database itself enforces, whatever the services do. */
class DatabaseRulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_two_spellings_of_one_manufacturer_cannot_both_be_saved(): void
    {
        Manufacturer::create(['name' => 'Nova Pharma', 'normalized_name' => Manufacturer::normalize('Nova Pharma')]);

        $this->expectException(QueryException::class);
        Manufacturer::create(['name' => 'NOVA-pharma', 'normalized_name' => Manufacturer::normalize('NOVA-pharma')]);
    }

    public function test_a_barcode_is_unique_across_the_whole_system(): void
    {
        $first = ItemBarcode::factory()->create();

        // The same code on another item, from another manufacturer.
        $this->expectException(QueryException::class);
        ItemBarcode::factory()->create(['barcode' => $first->barcode]);
    }

    public function test_an_item_can_have_several_barcodes_from_different_manufacturers(): void
    {
        $item = Item::factory()->create();
        ItemBarcode::factory()->count(2)->create(['item_id' => $item->id]);

        $this->assertSame(2, $item->barcodes()->distinct()->count('manufacturer_id'));
    }

    public function test_a_manufacturer_that_has_batches_cannot_be_deleted(): void
    {
        $manufacturer = Manufacturer::factory()->create();
        Batch::create([
            'item_id' => Item::factory()->create()->id,
            'manufacturer_id' => $manufacturer->id,
            'batch_number' => 'B-1',
            'unit_cost' => 5,
        ]);

        $this->expectException(QueryException::class);
        $manufacturer->delete();
    }

    public function test_batch_manufacturer_supplier_and_dates_are_optional(): void
    {
        $batch = Batch::create(['item_id' => Item::factory()->create()->id, 'batch_number' => 'B-1', 'unit_cost' => 5]);

        $this->assertNull($batch->manufacturer);
        $this->assertNull($batch->expiry_date);
        $this->assertSame(0, $batch->quantity);
    }
}
