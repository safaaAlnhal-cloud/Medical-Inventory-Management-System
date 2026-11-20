<?php

namespace Tests\Feature\Reports;

use App\Models\Batch;
use App\Models\Category;
use App\Models\Item;
use App\Models\Transaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /reports/movement_history and /reports/inventory_value: the two reports with a period and
 * history. BACKEND_HANDOFF.md section 4.8.
 */
class PeriodReportsTest extends TestCase
{
    use RefreshDatabase;

    private Category $medicines;

    private Category $supplies;

    private Item $para;

    private Item $gloves;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-03 10:00');
        $this->medicines = Category::factory()->create(['name' => 'Medicines']);
        $this->supplies = Category::factory()->create(['name' => 'Supplies']);
        $this->para = Item::factory()->create(['name' => 'Paracetamol', 'category_id' => $this->medicines->id, 'unit' => 'box']);
        $this->gloves = Item::factory()->create(['name' => 'Gloves', 'category_id' => $this->supplies->id, 'unit' => 'box']);
        $this->actingAsStorekeeper();
    }

    // ---- movement_history ----

    public function test_movement_history_lists_active_transactions_newest_first_with_their_value(): void
    {
        $batch = $this->receive($this->para, 10, 4.5, '2026-10-01', supplier: 'PharmaCo');   // $45
        $issue = $this->issue($batch, 3, '2026-10-05');                                     // 3 x $4.50
        $cancelled = $this->issue($batch, 1, '2026-10-06');
        $this->patchJson("/api/transactions/{$cancelled}/cancel")->assertOk();

        $response = $this->getJson('/api/reports/movement_history')->assertOk();

        $receipt = $batch->transactions()->where('type', 'incoming')->value('id');
        $response->assertJsonPath('rows', [
            ['id' => $issue, 'type' => 'outgoing', 'itemId' => $this->para->id, 'quantity' => 3, 'date' => '2026-10-05', 'supplier' => null, 'recipient' => 'Ward A', 'reason' => 'issue', 'unitCost' => 4.5, 'totalValue' => 13.5],
            ['id' => $receipt, 'type' => 'incoming', 'itemId' => $this->para->id, 'quantity' => 10, 'date' => '2026-10-01', 'supplier' => 'PharmaCo', 'recipient' => null, 'reason' => null, 'unitCost' => 4.5, 'totalValue' => 45],
        ]);
        $response->assertJsonPath('totals', ['incomingCount' => 1, 'outgoingCount' => 1, 'disposalCount' => 0, 'itemsCount' => 1, 'transactionsCount' => 2]);
    }

    public function test_movement_history_keeps_archived_items_and_counts_disposals_apart(): void
    {
        $expired = $this->receive($this->para, 4, 5, '2026-10-01', expiryDate: '2026-11-01');
        $this->postJson('/api/transactions/disposal', [
            'itemId' => $this->para->id, 'batchId' => $expired->id, 'quantity' => 4, 'date' => '2026-11-03',
        ])->assertCreated();
        $this->para->forceFill(['archived_at' => now()])->save();

        $this->getJson('/api/reports/movement_history')
            ->assertJsonPath('rows.0.reason', 'expired_disposal')
            ->assertJsonPath('totals', ['incomingCount' => 1, 'outgoingCount' => 0, 'disposalCount' => 1, 'itemsCount' => 1, 'transactionsCount' => 2]);
    }

    public function test_movement_history_period_and_search(): void
    {
        $batch = $this->receive($this->para, 10, 4, '2026-09-20', supplier: 'PharmaCo');
        $this->issue($batch, 1, '2026-10-02', recipient: 'Emergency');
        $this->receive($this->gloves, 10, 2, '2026-10-15', supplier: 'CareGoods');

        $count = fn (string $query) => $this->getJson("/api/reports/movement_history?{$query}")->assertOk()->json('totals.transactionsCount');

        $this->assertSame(2, $count('from=2026-10-01&to=2026-10-31'));
        $this->assertSame(1, $count('from=2026-10-01&to=2026-10-31&categoryId='.$this->medicines->id));
        $this->assertSame(2, $count('search=PARA'), 'item name');
        $this->assertSame(1, $count('search=caregoods'), 'supplier');
        $this->assertSame(1, $count('search=emergency'), 'recipient');
        $this->assertSame(2, $count('search=incoming'), 'type');
        $this->assertSame(2, $count('search='.$batch->batch_number), 'batch number');
        $this->assertSame(0, $count('search=disposal'));
    }

    // ---- inventory_value ----

    public function test_inventory_value_rows_and_totals(): void
    {
        // Paracetamol: 10 at $4 and 6 expired at $7, average (40 + 42) / 16 = 5.125.
        $this->receive($this->para, 10, 4, '2026-10-01');
        $expired = $this->receive($this->para, 6, 7, '2026-10-01', expiryDate: '2026-11-01');
        $gloves = $this->receive($this->gloves, 20, 2, '2026-10-10');
        $this->issue($gloves, 5, '2026-10-12');                                             // 5 x $2 issued
        $this->postJson('/api/transactions/disposal', [
            'itemId' => $this->para->id, 'batchId' => $expired->id, 'quantity' => 2, 'date' => '2026-11-03',
        ])->assertCreated();                                                                // 2 x $5.125 disposed

        $response = $this->getJson('/api/reports/inventory_value')->assertOk();

        $response->assertJsonPath('rows', [
            ['id' => $this->para->id, 'itemId' => $this->para->id, 'categoryId' => $this->medicines->id, 'quantity' => 10, 'expiredQuantity' => 4, 'unit' => 'box', 'unitCost' => 5.125, 'totalValue' => 51.25],
            ['id' => $this->gloves->id, 'itemId' => $this->gloves->id, 'categoryId' => $this->supplies->id, 'quantity' => 15, 'expiredQuantity' => 0, 'unit' => 'box', 'unitCost' => 2, 'totalValue' => 30],
        ]);
        $response->assertJsonPath('totals', [
            'totalItems' => 2, 'stockValue' => 81.25, 'expiredValue' => 20.5,
            'incomingValue' => 122, 'outgoingValue' => 10, 'disposedValue' => 10.25,
        ]);
        $response->assertJsonPath('breakdown', [
            ['categoryId' => $this->medicines->id, 'value' => 51.25],
            ['categoryId' => $this->supplies->id, 'value' => 30],
        ]);
    }

    public function test_the_period_applies_to_the_moved_values_only_and_archived_history_is_kept(): void
    {
        $this->receive($this->para, 10, 4, '2026-09-01');                                   // before the period
        $this->receive($this->gloves, 10, 2, '2026-10-05');
        $this->gloves->forceFill(['archived_at' => now()])->save();

        $response = $this->getJson('/api/reports/inventory_value?from=2026-10-01&to=2026-10-31')->assertOk();

        $response->assertJsonPath('totals.totalItems', 1)                                   // the archived item has no row
            ->assertJsonPath('totals.stockValue', 40)                                       // today's stock, whatever the period
            ->assertJsonPath('totals.incomingValue', 20);                                   // only October, archived included
        $this->assertSame([$this->para->id], $response->json('rows.*.itemId'));
    }

    public function test_moved_values_equal_the_movement_history_rows(): void
    {
        $batch = $this->receive($this->para, 7, 3.333, '2026-10-01');
        $this->issue($batch, 3, '2026-10-02');
        $this->issue($batch, 1, '2026-10-03');

        $history = $this->getJson('/api/reports/movement_history')->json('rows');
        $sum = fn (string $type) => round(array_sum(array_column(array_filter($history, fn ($row) => $row['type'] === $type), 'totalValue')), 2);

        $this->getJson('/api/reports/inventory_value')
            ->assertJsonPath('totals.incomingValue', $sum('incoming'))
            ->assertJsonPath('totals.outgoingValue', $sum('outgoing'));
    }

    public function test_the_four_reports_export_from_the_real_data(): void
    {
        $this->receive($this->para, 10, 4, '2026-10-01');

        foreach (['summary', 'movement_history', 'critical_items', 'inventory_value'] as $type) {
            $this->get("/api/reports/{$type}/export?format=csv")->assertOk();
        }
        $this->assertDatabaseCount('report_exports', 4);
    }

    private function receive(Item $item, int $quantity, float $unitCost, string $date, ?string $expiryDate = '2027-11-01', ?string $supplier = null): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $item->id, 'batchNumber' => 'P-'.++$counter, 'quantity' => $quantity,
            'unitCost' => $unitCost, 'date' => $date, 'expiryDate' => $expiryDate, 'supplier' => $supplier,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    /** @return int the outgoing transaction's id */
    private function issue(Batch $batch, int $quantity, string $date, string $recipient = 'Ward A'): int
    {
        $this->travel(1)->seconds();

        return $this->postJson('/api/transactions/outgoing', [
            'itemId' => $batch->item_id, 'batchId' => $batch->id, 'quantity' => $quantity,
            'recipient' => $recipient, 'date' => $date,
        ])->assertCreated()->json('id');
    }
}
