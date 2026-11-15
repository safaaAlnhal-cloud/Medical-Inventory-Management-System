<?php

namespace Tests\Feature\Items;

use App\Models\Item;
use App\Models\ItemBarcode;
use App\Models\Manufacturer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /inventory/by-barcode/{code}, POST /inventory/{item}/barcodes,
 * DELETE /inventory/{item}/barcodes/{barcode}: BACKEND_HANDOFF.md section 4.4.
 */
class BarcodesTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private Manufacturer $pharmaco;

    protected function setUp(): void
    {
        parent::setUp();
        $this->item = Item::factory()->create(['name' => 'Paracetamol 500mg', 'unit' => 'box']);
        $this->pharmaco = Manufacturer::create(['name' => 'PharmaCo', 'normalized_name' => 'pharmaco']);
        $this->actingAsStorekeeper();
    }

    // ---- Link ----------------------------------------------------------------------------------

    public function test_a_barcode_is_linked_with_an_existing_manufacturer_matched_by_any_spelling(): void
    {
        $this->postJson("/api/inventory/{$this->item->id}/barcodes", ['barcode' => ' 6251234567890 ', 'manufacturer' => 'pharma co.'])
            ->assertCreated()
            ->assertJsonPath('id', $this->item->id)
            ->assertJsonPath('barcodes', [['id' => ItemBarcode::first()->id, 'barcode' => '6251234567890', 'manufacturerId' => $this->pharmaco->id]]);

        $this->assertDatabaseCount('manufacturers', 1);
    }

    public function test_a_new_manufacturer_name_creates_the_manufacturer(): void
    {
        $this->postJson("/api/inventory/{$this->item->id}/barcodes", ['barcode' => 'ABC-1', 'manufacturer' => 'BioLab'])->assertCreated();

        $bioLab = Manufacturer::where('name', 'BioLab')->firstOrFail();
        $this->assertDatabaseHas('item_barcodes', ['item_id' => $this->item->id, 'barcode' => 'ABC-1', 'manufacturer_id' => $bioLab->id]);
    }

    public function test_a_barcode_used_by_any_item_archived_ones_included_is_a_409(): void
    {
        $archived = Item::factory()->archived()->create(['name' => 'Old Syrup']);
        ItemBarcode::factory()->create(['item_id' => $archived->id, 'barcode' => '111', 'manufacturer_id' => $this->pharmaco->id]);

        $this->postJson("/api/inventory/{$this->item->id}/barcodes", ['barcode' => '111', 'manufacturer' => 'NewCo'])
            ->assertConflict()
            ->assertJsonPath('errors.barcode', 'This barcode is already linked to "Old Syrup".');

        // The refused link left no new manufacturer behind.
        $this->assertDatabaseMissing('manufacturers', ['name' => 'NewCo']);
    }

    public function test_the_link_checks_both_fields(): void
    {
        $url = "/api/inventory/{$this->item->id}/barcodes";

        $this->postJson($url, ['barcode' => '   ', 'manufacturer' => ''])
            ->assertUnprocessable()
            ->assertJsonPath('errors.barcode', 'Enter the barcode.')
            ->assertJsonPath('errors.manufacturer', 'Enter the manufacturer of this barcode.');
        $this->postJson($url, ['barcode' => '625 123', 'manufacturer' => 'PharmaCo'])
            ->assertJsonPath('errors.barcode', 'The barcode may not contain spaces.');
        $this->postJson($url, ['barcode' => str_repeat('1', 65), 'manufacturer' => 'PharmaCo'])
            ->assertJsonPath('errors.barcode', 'The barcode may not be longer than 64 characters.');
        $this->postJson($url, ['barcode' => '1', 'manufacturer' => '...'])
            ->assertJsonPath('errors.manufacturer', 'Enter a manufacturer name with letters or numbers.');

        $this->assertDatabaseCount('item_barcodes', 0);
    }

    // ---- Find ----------------------------------------------------------------------------------

    public function test_a_scan_finds_the_item_and_its_manufacturer_exactly(): void
    {
        ItemBarcode::factory()->create(['item_id' => $this->item->id, 'barcode' => 'Ab-1', 'manufacturer_id' => $this->pharmaco->id]);

        $this->getJson('/api/inventory/by-barcode/Ab-1')->assertOk()->assertExactJson([
            'item' => ['id' => $this->item->id, 'name' => 'Paracetamol 500mg', 'unit' => 'box', 'archived' => false],
            'manufacturerId' => $this->pharmaco->id,
            'barcode' => 'Ab-1',
        ]);
        $this->getJson('/api/inventory/by-barcode/ab-1')->assertNotFound();
        $this->getJson('/api/inventory/by-barcode/999')->assertNotFound();
    }

    public function test_a_scan_finds_an_archived_item_marked_archived(): void
    {
        $this->item->forceFill(['archived_at' => now()])->save();
        ItemBarcode::factory()->create(['item_id' => $this->item->id, 'barcode' => '555', 'manufacturer_id' => $this->pharmaco->id]);

        $this->getJson('/api/inventory/by-barcode/555')->assertOk()->assertJsonPath('item.archived', true);
    }

    public function test_the_inventory_search_finds_an_item_by_barcode_manufacturer_or_active_ingredient(): void
    {
        $this->item->update(['active_ingredient' => 'Acetaminophen']);
        ItemBarcode::factory()->create(['item_id' => $this->item->id, 'barcode' => '6251234567890', 'manufacturer_id' => $this->pharmaco->id]);
        Item::factory()->create(['name' => 'Gloves']);

        foreach (['625123', 'pharma', 'acetamin'] as $search) {
            $this->assertSame([$this->item->id], $this->getJson("/api/inventory?search={$search}")->json('*.id'), $search);
        }
    }

    // ---- Remove --------------------------------------------------------------------------------

    public function test_a_barcode_is_removed_and_the_item_is_returned(): void
    {
        $barcode = ItemBarcode::factory()->create(['item_id' => $this->item->id, 'manufacturer_id' => $this->pharmaco->id]);

        $this->deleteJson("/api/inventory/{$this->item->id}/barcodes/{$barcode->id}")
            ->assertOk()
            ->assertJsonPath('barcodes', []);
        $this->assertModelMissing($barcode);
    }

    public function test_another_items_barcode_is_a_404(): void
    {
        $other = ItemBarcode::factory()->create(['manufacturer_id' => $this->pharmaco->id]);

        $this->deleteJson("/api/inventory/{$this->item->id}/barcodes/{$other->id}")->assertNotFound();
        $this->assertModelExists($other);
    }

    public function test_the_barcodes_of_an_archived_item_cannot_be_added_or_removed(): void
    {
        $barcode = ItemBarcode::factory()->create(['item_id' => $this->item->id, 'manufacturer_id' => $this->pharmaco->id]);
        $this->item->forceFill(['archived_at' => now()])->save();
        $message = 'This item is deactivated. Reactivate it before changing its barcodes.';

        $this->postJson("/api/inventory/{$this->item->id}/barcodes", ['barcode' => 'NEW', 'manufacturer' => 'PharmaCo'])
            ->assertConflict()->assertJsonPath('message', $message);
        $this->deleteJson("/api/inventory/{$this->item->id}/barcodes/{$barcode->id}")
            ->assertConflict()->assertJsonPath('message', $message);
        $this->assertModelExists($barcode);
    }
}
