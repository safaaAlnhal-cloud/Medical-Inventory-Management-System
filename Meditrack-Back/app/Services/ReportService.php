<?php

namespace App\Services;

use App\Enums\ExpiryStatus;
use App\Enums\ReportType;
use App\Enums\StockStatus;
use App\Enums\TransactionType;
use App\Models\Batch;
use App\Models\Item;
use App\Reports\ReportFilters;
use App\Reports\ReportResult;
use Illuminate\Support\Collection;
use LogicException;

/**
 * SHARED CONTRACT. Owner: Developer A (phase 5). Used by Developer B in the export.
 * The signature and the ReportResult shape are agreed: change them only together.
 * BACKEND_HANDOFF.md section 4.8 (filters per report, rows, totals, order).
 *
 * Nothing is stored for a report: it is worked out from the batches and transactions when asked,
 * with the same rules as the Inventory page (StockStatus, Batch::expiryStatus), so a report
 * always agrees with the inventory, the dashboard and the alerts.
 * Mirrors buildMockReport in src/services/reportsApi.js.
 */
class ReportService
{
    /**
     * Builds one report.
     *
     * - With $page and $pageSize: that page of rows, and pagination filled in (GET /reports/{type}).
     * - Without them: every row, and pagination null (GET /reports/{type}/export, no row limit).
     *
     * Totals are the same either way. Reports that ignore the period
     * (ReportType::usesPeriod() is false) ignore $filters->from / to.
     */
    public function build(ReportType $type, ReportFilters $filters, ?int $page = null, ?int $pageSize = null): ReportResult
    {
        [$totals, $breakdown, $rows] = match ($type) {
            ReportType::Summary => $this->summary($filters),
            ReportType::CriticalItems => $this->criticalItems($filters),
            ReportType::MovementHistory, ReportType::InventoryValue => throw new LogicException("The {$type->value} report is not built yet (phase 5, step 3)."),
        };

        if ($page === null || $pageSize === null) {
            return new ReportResult($type, $totals, $breakdown, $rows);
        }

        // As the mock: a page past the end shows the last page.
        $totalPages = max(1, (int) ceil(count($rows) / $pageSize));
        $page = min(max(1, $page), $totalPages);

        return new ReportResult($type, $totals, $breakdown, array_slice($rows, ($page - 1) * $pageSize, $pageSize), [
            'page' => $page,
            'pageSize' => $pageSize,
            'totalItems' => count($rows),
            'totalPages' => $totalPages,
        ]);
    }

    /**
     * summary: one row per active item, in item order.
     *   quantity      available stock (expired stock does not count)
     *   totalValue    available value: quantity x the item's Average Cost
     *   status        available / low_stock / out_of_stock
     *
     * @return array{0: array<string, int>, 1: list<array>, 2: list<array<string, mixed>>}
     */
    private function summary(ReportFilters $filters): array
    {
        $inventory = $this->inventory($filters);

        $rows = $inventory->map(fn (array $item) => [
            'id' => $item['id'],
            'itemId' => $item['id'],
            'categoryId' => $item['categoryId'],
            'quantity' => $item['quantity'],
            'expiredQuantity' => $item['expiredQuantity'],
            'unit' => $item['unit'],
            'totalValue' => $item['stockValue'],
            'status' => $item['status']->value,
        ])->values()->all();

        $byStatus = $inventory->countBy(fn (array $item) => $item['status']->value);

        return [[
            'totalItems' => count($rows),
            'available' => $byStatus[StockStatus::Available->value] ?? 0,
            'lowStock' => $byStatus[StockStatus::LowStock->value] ?? 0,
            'outOfStock' => $byStatus[StockStatus::OutOfStock->value] ?? 0,
        ], [], $rows];
    }

    /**
     * critical_items: one row per problem, so an item can have up to three rows (BACKEND_HANDOFF.md
     * "critical_items rows"), in item order:
     *
     *   stock row          low_stock / out_of_stock; quantity = available stock. Not for an item
     *                      that has never received stock: nothing ran out, it was never stocked
     *                      (the alerts follow the same rule).
     *   expired row        quantity = expired stock awaiting disposal
     *   expiring_soon row  quantity = stock in the batches about to expire
     *
     * expiryDate is the nearest expiry of the batches behind an expiry row (null on a stock row).
     *
     * @return array{0: array<string, int>, 1: list<array>, 2: list<array<string, mixed>>}
     */
    private function criticalItems(ReportFilters $filters): array
    {
        $rows = [];
        foreach ($this->inventory($filters) as $item) {
            $base = [
                'itemId' => $item['id'],
                'categoryId' => $item['categoryId'],
                'quantity' => $item['quantity'],
                'minQty' => $item['minQty'],
                'unit' => $item['unit'],
                'expiryDate' => null,
            ];

            if ($item['status'] !== StockStatus::Available && $item['hasReceivedStock']) {
                $rows[] = ['id' => "{$item['status']->value}-{$item['id']}", ...$base, 'status' => $item['status']->value];
            }

            foreach ([ExpiryStatus::Expired, ExpiryStatus::ExpiringSoon] as $expiry) {
                $batches = $item['batches']->filter(fn (Batch $batch) => $batch->expiryStatus() === $expiry);
                if ($batches->isEmpty()) {
                    continue;
                }
                $rows[] = [
                    'id' => "{$expiry->value}-{$item['id']}",
                    ...$base,
                    'quantity' => $batches->sum('quantity'),
                    'expiryDate' => $batches->min(fn (Batch $batch) => $batch->expiry_date->toDateString()),
                    'status' => $expiry->value,
                ];
            }
        }

        $count = fn (string $status) => count(array_filter($rows, fn (array $row) => $row['status'] === $status));

        return [[
            'totalItems' => count(array_unique(array_column($rows, 'itemId'))),
            'lowStock' => $count(StockStatus::LowStock->value),
            'outOfStock' => $count(StockStatus::OutOfStock->value),
            'expired' => $count(ExpiryStatus::Expired->value),
            'expiringSoon' => $count(ExpiryStatus::ExpiringSoon->value),
            'expiring' => $count(ExpiryStatus::Expired->value) + $count(ExpiryStatus::ExpiringSoon->value),
            'alerts' => count($rows),
        ], [], $rows];
    }

    /**
     * The active inventory as it is today, filtered by category, item and search (item name or
     * category name, letter case ignored), in item order. Archived items are left out. Each item
     * carries the figures the reports read, worked out like ItemResource does.
     *
     * @return Collection<int, array{id: int, categoryId: int, unit: string, minQty: int, quantity: int, expiredQuantity: int, avgUnitCost: float, stockValue: float, expiredValue: float, status: StockStatus, hasReceivedStock: bool, batches: Collection<int, Batch>}>
     */
    private function inventory(ReportFilters $filters): Collection
    {
        // Searched in the database, like the other lists (TransactionService, ItemService). % and _
        // are escaped so they match themselves; like ignores letter case.
        $like = '%'.addcslashes((string) $filters->search, '%_\\').'%';

        return Item::query()
            ->active()
            ->when($filters->categoryId, fn ($query, $id) => $query->where('category_id', $id))
            ->when($filters->itemId, fn ($query, $id) => $query->whereKey($id))
            ->when($filters->search, fn ($query) => $query->where(fn ($matches) => $matches
                ->where('name', 'like', $like)
                ->orWhereHas('category', fn ($category) => $category->where('name', 'like', $like))))
            ->with([
                'batches' => fn ($batches) => $batches->where('quantity', '>', 0)->orderBy('id'),
            ])
            ->withExists(['transactions as has_received_stock' => fn ($transactions) => $transactions
                ->active()
                ->where('type', TransactionType::Incoming)])
            ->orderBy('id')
            ->get()
            ->map(function (Item $item) {
                $quantity = $item->batches->sum(fn (Batch $batch) => $batch->availableQuantity());
                $expiredQuantity = $item->batches->sum(fn (Batch $batch) => $batch->expiredQuantity());
                $average = (float) $item->avg_unit_cost;

                return [
                    'id' => $item->id,
                    'categoryId' => $item->category_id,
                    'unit' => $item->unit->value,
                    'minQty' => $item->min_qty,
                    'quantity' => $quantity,
                    'expiredQuantity' => $expiredQuantity,
                    'avgUnitCost' => $average,
                    // Rounded per item, as the mock and the Inventory page: round the total, not the unit cost.
                    'stockValue' => round($quantity * $average, 2),
                    'expiredValue' => round($expiredQuantity * $average, 2),
                    'status' => StockStatus::of($quantity, $item->min_qty),
                    'hasReceivedStock' => (bool) $item->has_received_stock,
                    'batches' => $item->batches,
                ];
            })
            ->toBase();
    }
}
