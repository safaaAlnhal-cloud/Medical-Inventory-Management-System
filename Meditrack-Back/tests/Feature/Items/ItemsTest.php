<?php

namespace Tests\Feature\Items;

use App\Models\Batch;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemArchival;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /inventory, /inventory/archived, /inventory/lookup, POST and PUT /inventory: section 4.4. */
class ItemsTest extends TestCase
{
    use RefreshDatabase;

    private Category $medications;

    private Category $supplies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-13 10:00');
        $this->medications = Category::create(['name' => 'Medications']);
        $this->supplies = Category::create(['name' => 'Supplies']);
        $this->actingAsStorekeeper();
    }

    // ---- GET /inventory ------------------------------------------------------------------------

    public function test_an_item_carries_its_stock_figures_worked_out_from_its_batches(): void
    {
        $item = Item::factory()->create(['name' => 'Paracetamol', 'category_id' => $this->medications->id, 'unit' => 'box', 'min_qty' => 20]);
        $expired = $this->receive($item, 'OLD-1', 10, 5, '2026-11-12');      // expired yesterday
        $this->receive($item, 'PC-2', 30, 8, '2027-03-01');
        $this->receive($item, 'PC-3', 5, 8, '2026-12-01');                    // expiring soon
        $this->dispose($expired, 4);

        $this->getJson('/api/inventory')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJson([[
                'id' => $item->id, 'name' => 'Paracetamol', 'categoryId' => $this->medications->id, 'unit' => 'box', 'minQty' => 20,
                'quantity' => 35, 'expiredQuantity' => 6, 'disposedQuantity' => 4, 'status' => 'available',
                'avgUnitCost' => 7.3333, 'nearestExpiryDate' => '2026-12-01',
                'batches' => [
                    ['batchNumber' => 'OLD-1', 'quantity' => 6, 'availableQuantity' => 0, 'expiredQuantity' => 6, 'unitCost' => 5, 'expiryStatus' => 'expired'],
                    ['batchNumber' => 'PC-2', 'quantity' => 30, 'availableQuantity' => 30, 'expiredQuantity' => 0, 'expiryStatus' => null],
                    ['batchNumber' => 'PC-3', 'quantity' => 5, 'availableQuantity' => 5, 'expiryStatus' => 'expiring_soon'],
                ],
                'barcodes' => [], 'archived' => false, 'archivedAt' => null,
                'archiveReason' => null, 'archivedBy' => null, 'archiveHistoryCount' => 0,
            ]]);
    }

    public function test_a_new_item_is_out_of_stock_and_a_used_up_batch_is_not_listed(): void
    {
        $item = Item::factory()->create(['min_qty' => 5]);
        $this->getJson('/api/inventory')->assertJsonPath('0.status', 'out_of_stock')->assertJsonPath('0.batches', []);

        $this->receive($item, 'B-1', 3, 2, '2027-01-01');
        $this->getJson('/api/inventory')->assertJsonPath('0.status', 'low_stock')->assertJsonPath('0.quantity', 3);
    }

    public function test_the_active_list_leaves_out_archived_items_and_searches_name_category_unit_and_batch(): void
    {
        $paracetamol = Item::factory()->create(['name' => 'Paracetamol', 'category_id' => $this->medications->id, 'unit' => 'box']);
        $gloves = Item::factory()->create(['name' => 'Gloves', 'category_id' => $this->supplies->id, 'unit' => 'pack']);
        Item::factory()->archived()->create(['name' => 'Old Syrup', 'category_id' => $this->medications->id]);
        $this->receive($gloves, 'GL-77', 10, 1, null);

        $this->assertSame([$paracetamol->id, $gloves->id], $this->getJson('/api/inventory')->json('*.id'));
        $this->assertSame([$paracetamol->id], $this->getJson('/api/inventory?search=PARA')->json('*.id'));
        $this->assertSame([$paracetamol->id], $this->getJson('/api/inventory?search=medic')->json('*.id'));
        $this->assertSame([$gloves->id], $this->getJson('/api/inventory?search=pack')->json('*.id'));
        $this->assertSame([$gloves->id], $this->getJson('/api/inventory?search=%20gl-7%20')->json('*.id'));
        $this->assertSame([], $this->getJson('/api/inventory?search=syrup')->json());
    }

    // ---- GET /inventory/archived and /inventory/lookup -----------------------------------------

    public function test_the_archived_list_is_most_recently_archived_first_with_its_reason(): void
    {
        $user = User::factory()->create();
        $older = Item::factory()->create(['name' => 'Older', 'archived_at' => now()->subDays(2)]);
        $newer = Item::factory()->create(['name' => 'Newer', 'archived_at' => now()->subDay()]);
        Item::factory()->create(['name' => 'Active']);
        ItemArchival::create(['item_id' => $newer->id, 'reason' => 'Discontinued', 'archived_by' => $user->id, 'archived_at' => $newer->archived_at]);

        $this->getJson('/api/inventory/archived')
            ->assertOk()
            ->assertJsonPath('*.id', [$newer->id, $older->id])
            ->assertJsonPath('0.archived', true)
            ->assertJsonPath('0.archiveReason', 'Discontinued')
            ->assertJsonPath('0.archivedBy', $user->id)
            ->assertJsonPath('0.archiveHistoryCount', 1);
        $this->assertSame([$older->id], $this->getJson('/api/inventory/archived?search=old')->json('*.id'));
    }

    public function test_the_lookup_lists_every_item_archived_ones_included(): void
    {
        $active = Item::factory()->create(['name' => 'Active', 'unit' => 'box']);
        $archived = Item::factory()->archived()->create(['name' => 'Gone', 'unit' => 'vial']);

        $this->getJson('/api/inventory/lookup')->assertOk()->assertExactJson([
            ['id' => $active->id, 'name' => 'Active', 'unit' => 'box', 'archived' => false],
            ['id' => $archived->id, 'name' => 'Gone', 'unit' => 'vial', 'archived' => true],
        ]);
    }

    // ---- POST /inventory -----------------------------------------------------------------------

    public function test_a_storekeeper_creates_an_item_with_no_stock_and_its_details(): void
    {
        $this->postJson('/api/inventory', [
            'name' => '  Bandage Roll ', 'categoryId' => $this->supplies->id, 'unit' => 'pack', 'minQty' => 0,
            'dosageForm' => 'Roll', 'description' => '',
        ])
            ->assertCreated()
            ->assertJson([
                'name' => 'Bandage Roll', 'categoryId' => $this->supplies->id, 'unit' => 'pack', 'minQty' => 0,
                'quantity' => 0, 'status' => 'out_of_stock', 'avgUnitCost' => 0, 'batches' => [],
                'dosageForm' => 'Roll', 'description' => null, 'activeIngredient' => null,
            ]);
    }

    public function test_a_name_used_by_an_active_item_is_a_409_but_an_archived_one_does_not_block_it(): void
    {
        Item::factory()->create(['name' => 'Paracetamol']);
        Item::factory()->archived()->create(['name' => 'Old Syrup']);
        $payload = ['categoryId' => $this->medications->id, 'unit' => 'box', 'minQty' => 1];

        $this->postJson('/api/inventory', ['name' => 'PARACETAMOL', ...$payload])
            ->assertConflict()
            ->assertJsonPath('errors.name', 'An active item with this name already exists.');
        $this->postJson('/api/inventory', ['name' => 'old syrup', ...$payload])->assertCreated();
    }

    public function test_create_checks_every_field(): void
    {
        $this->postJson('/api/inventory', [
            'name' => '   ', 'categoryId' => 999, 'unit' => 'crate', 'minQty' => -1, 'strength' => str_repeat('a', 51),
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name', 'Item name is required.')
            ->assertJsonPath('errors.categoryId', 'Please choose a valid category.')
            ->assertJsonPath('errors.unit', 'Please choose a valid unit.')
            ->assertJsonPath('errors.minQty', 'Minimum quantity must be zero or more.')
            ->assertJsonPath('errors.strength', 'This field may not be longer than 50 characters.');

        $this->postJson('/api/inventory', ['name' => 'X', 'categoryId' => $this->medications->id, 'unit' => 'box', 'minQty' => 1.5])
            ->assertJsonPath('errors.minQty', 'Minimum quantity must be a whole number.');
    }

    // ---- PUT /inventory/{item} -----------------------------------------------------------------

    public function test_an_update_changes_the_form_fields_and_never_the_stock(): void
    {
        $item = Item::factory()->create(['name' => 'Paracetamol', 'strength' => '500 mg', 'uses' => 'Pain']);
        $this->receive($item, 'B-1', 10, 4, '2027-01-01');

        $this->putJson("/api/inventory/{$item->id}", [
            'name' => 'paracetamol', 'categoryId' => $this->supplies->id, 'unit' => 'strip', 'minQty' => 50,
            'uses' => null, 'quantity' => 999, 'avgUnitCost' => 1, 'archived' => true,
        ])
            ->assertOk()
            ->assertJson([
                'name' => 'paracetamol', 'categoryId' => $this->supplies->id, 'unit' => 'strip', 'minQty' => 50,
                'quantity' => 10, 'avgUnitCost' => 4, 'status' => 'low_stock', 'archived' => false,
                'strength' => '500 mg', 'uses' => null,
            ]);
    }

    public function test_an_update_refuses_another_active_items_name_an_archived_item_and_an_unknown_id(): void
    {
        $item = Item::factory()->create(['name' => 'Paracetamol']);
        Item::factory()->create(['name' => 'Ibuprofen']);
        $archived = Item::factory()->archived()->create(['name' => 'Old Syrup']);
        $payload = ['categoryId' => $this->medications->id, 'unit' => 'box', 'minQty' => 1];

        $this->putJson("/api/inventory/{$item->id}", ['name' => 'Ibuprofen', ...$payload])->assertConflict();
        $this->putJson("/api/inventory/{$archived->id}", ['name' => 'Old Syrup', ...$payload])
            ->assertConflict()
            ->assertJsonPath('message', 'This item is deactivated. Reactivate it before editing it.');
        $this->putJson('/api/inventory/999', ['name' => 'X', ...$payload])->assertNotFound();
    }

    public function test_a_signed_out_request_is_a_401(): void
    {
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/inventory')->assertUnauthorized();
    }

    // ---- Helpers -------------------------------------------------------------------------------

    private function receive(Item $item, string $number, int $quantity, float $unitCost, ?string $expiryDate): Batch
    {
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $item->id, 'batchNumber' => $number, 'quantity' => $quantity, 'unitCost' => $unitCost,
            'date' => '2026-11-01', 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    private function dispose(Batch $batch, int $quantity): void
    {
        $this->postJson('/api/transactions/disposal', [
            'itemId' => $batch->item_id, 'batchId' => $batch->id, 'quantity' => $quantity, 'date' => '2026-11-13',
        ])->assertCreated();
    }
}
