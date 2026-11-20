<?php

namespace Tests\Feature\Reports;

use App\Models\Batch;
use App\Models\Category;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /reports/summary and /reports/critical_items: the two reports of the inventory as it is
 * today. BACKEND_HANDOFF.md section 4.8.
 */
class CurrentInventoryReportsTest extends TestCase
{
    use RefreshDatabase;

    private Category $medicines;

    private Category $supplies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-19 10:00');
        $this->medicines = Category::factory()->create(['name' => 'Medicines']);
        $this->supplies = Category::factory()->create(['name' => 'Supplies']);
        $this->actingAsStorekeeper();
    }

    // ---- summary ----

    public function test_summary_lists_each_active_item_with_its_available_stock_and_value(): void
    {
        $para = $this->item('Paracetamol', $this->medicines, minQty: 5);
        $this->receive($para, 10, 4);                                                     // 10 available
        $this->receive($para, 6, 7, date: '2026-11-01', expiryDate: '2026-11-18');        // 6 expired; average (40 + 42) / 16 = 5.125
        $gloves = $this->item('Gloves', $this->supplies, minQty: 20);
        $this->receive($gloves, 15, 2);                                                   // low
        $this->item('Gauze', $this->supplies);                                            // never received: out of stock
        $this->item('Old', $this->supplies)->forceFill(['archived_at' => now()])->save(); // left out

        $this->getJson('/api/reports/summary')->assertOk()->assertExactJson([
            'type' => 'summary',
            'totals' => ['totalItems' => 3, 'available' => 1, 'lowStock' => 1, 'outOfStock' => 1],
            'breakdown' => [],
            'rows' => [
                ['id' => $para->id, 'itemId' => $para->id, 'categoryId' => $this->medicines->id, 'quantity' => 10, 'expiredQuantity' => 6, 'unit' => 'box', 'totalValue' => 51.25, 'status' => 'available'],
                ['id' => $gloves->id, 'itemId' => $gloves->id, 'categoryId' => $this->supplies->id, 'quantity' => 15, 'expiredQuantity' => 0, 'unit' => 'box', 'totalValue' => 30, 'status' => 'low_stock'],
                ['id' => $gloves->id + 1, 'itemId' => $gloves->id + 1, 'categoryId' => $this->supplies->id, 'quantity' => 0, 'expiredQuantity' => 0, 'unit' => 'box', 'totalValue' => 0, 'status' => 'out_of_stock'],
            ],
            'pagination' => ['page' => 1, 'pageSize' => 10, 'totalItems' => 3, 'totalPages' => 1],
        ]);
    }

    public function test_the_filters_apply_and_the_period_is_ignored(): void
    {
        $para = $this->item('Paracetamol', $this->medicines);
        $this->item('Ibuprofen', $this->medicines);
        $gloves = $this->item('Gloves', $this->supplies);

        $ids = fn (string $query) => $this->getJson("/api/reports/summary?{$query}")->assertOk()->json('rows.*.itemId');

        $this->assertSame([$para->id, $para->id + 1], $ids("categoryId={$this->medicines->id}"));
        $this->assertSame([$gloves->id], $ids("itemId={$gloves->id}"));
        $this->assertSame([$para->id], $ids('search=PARA'));
        $this->assertSame([$gloves->id], $ids('search=suppl'), 'search matches the category name');
        $this->assertCount(3, $ids('from=2020-01-01&to=2020-01-31'), 'summary shows the inventory today');
    }

    public function test_pages_carry_whole_totals(): void
    {
        foreach (range(1, 7) as $n) {
            $this->item("Item {$n}", $this->medicines);
        }

        $this->getJson('/api/reports/summary?page=2&pageSize=5')
            ->assertJsonCount(2, 'rows')
            ->assertJsonPath('totals.totalItems', 7)
            ->assertJsonPath('pagination', ['page' => 2, 'pageSize' => 5, 'totalItems' => 7, 'totalPages' => 2]);
        // A page past the end shows the last page.
        $this->getJson('/api/reports/summary?page=9&pageSize=5')->assertJsonPath('pagination.page', 2);
    }

    // ---- critical_items ----

    public function test_critical_items_has_one_row_per_problem(): void
    {
        // Low on stock (8 usable, minimum 10), part of it expiring soon, and an expired batch.
        $para = $this->item('Paracetamol', $this->medicines, minQty: 10);
        $this->receive($para, 5, 4, expiryDate: '2026-12-05');
        $this->receive($para, 3, 4, expiryDate: '2026-12-01');
        $this->receive($para, 6, 4, date: '2026-11-01', expiryDate: '2026-11-18');
        $this->receive($this->item('Gloves', $this->supplies), 50, 2);                    // fine: no row
        $this->item('Gauze', $this->supplies);                                            // never stocked: no row

        $response = $this->getJson('/api/reports/critical_items')->assertOk();

        $row = fn (string $status, int $quantity, ?string $expiryDate) => [
            'id' => "{$status}-{$para->id}", 'itemId' => $para->id, 'categoryId' => $this->medicines->id,
            'quantity' => $quantity, 'minQty' => 10, 'unit' => 'box', 'expiryDate' => $expiryDate, 'status' => $status,
        ];
        $response->assertJsonPath('rows', [
            $row('low_stock', 8, null),
            $row('expired', 6, '2026-11-18'),
            $row('expiring_soon', 8, '2026-12-01'),
        ]);
        $response->assertJsonPath('totals', [
            'totalItems' => 1, 'lowStock' => 1, 'outOfStock' => 0, 'expired' => 1, 'expiringSoon' => 1, 'expiring' => 2, 'alerts' => 3,
        ]);
    }

    public function test_an_item_that_ran_out_has_an_out_of_stock_row(): void
    {
        $para = $this->item('Paracetamol', $this->medicines);
        $batch = $this->receive($para, 2, 4);
        $this->travel(1)->seconds();
        $this->postJson('/api/transactions/outgoing', [
            'itemId' => $para->id, 'batchId' => $batch->id, 'quantity' => 2, 'recipient' => 'Ward', 'date' => '2026-11-19',
        ])->assertCreated();

        $this->getJson('/api/reports/critical_items')
            ->assertJsonPath('rows.0.id', "out_of_stock-{$para->id}")
            ->assertJsonPath('totals.outOfStock', 1);
    }

    // ---- The endpoint ----

    public function test_unknown_types_and_bad_filters_are_rejected(): void
    {
        $this->getJson('/api/reports/stock_levels')->assertNotFound();
        $this->getJson('/api/reports/summary?categoryId=999')->assertStatus(422)->assertJsonValidationErrors('categoryId');
        $this->getJson('/api/reports/summary?from=2026-11-10&to=2026-11-01')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/reports/summary?pageSize=1001')->assertStatus(422)->assertJsonValidationErrors('pageSize');
    }

    public function test_both_roles_can_read_reports_and_export_them(): void
    {
        $this->item('Paracetamol', $this->medicines);
        $this->getJson('/api/reports/summary')->assertOk();

        $this->actingAsAdmin();
        $this->getJson('/api/reports/critical_items')->assertOk();
        // The export (Developer B) now reads this real report.
        $this->get('/api/reports/summary/export?format=csv')->assertOk();
        $this->assertDatabaseHas('report_exports', ['report_type' => 'summary', 'row_count' => 1]);
    }

    private function item(string $name, Category $category, int $minQty = 0): Item
    {
        return Item::factory()->create(['name' => $name, 'category_id' => $category->id, 'min_qty' => $minQty, 'unit' => 'box']);
    }

    private function receive(Item $item, int $quantity, float $unitCost, string $date = '2026-11-10', ?string $expiryDate = '2027-11-01'): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $item->id, 'batchNumber' => 'S-'.++$counter, 'quantity' => $quantity,
            'unitCost' => $unitCost, 'date' => $date, 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }
}
