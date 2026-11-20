<?php

namespace App\Services;

use App\Enums\ExpiryStatus;
use App\Enums\OutgoingReason;
use App\Enums\StockStatus;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * The dashboards' own figures. Owner: Developer A. BACKEND_HANDOFF.md section 4.7.
 * (/dashboard/alerts is Developer B's, in NotificationService.)
 *
 * Nothing here is stored: every figure is worked out from the batches and transactions when
 * asked, with the same rules as the Inventory page (StockStatus, Batch::expiryStatus), so the
 * dashboard always agrees with it.
 */
class DashboardService
{
    public function __construct(private readonly ReportService $reports) {}

    /**
     * GET /dashboard/summary: numbers of ACTIVE items, so nothing adds boxes to bottles.
     *
     *   availableCount, lowStockCount, outOfStockCount   by stock status; they add up to totalItems
     *   expiringSoonCount   items with stock in a batch that expires soon (not yet expired)
     *   expiredCount        items with expired stock awaiting disposal
     *
     * An item can be counted both as expiring soon and as expired.
     *
     * @return array<string, int>
     */
    public function summary(): array
    {
        $items = Item::query()
            ->active()
            ->with(['batches' => fn ($batches) => $batches->where('quantity', '>', 0)])
            ->get();

        $status = fn (Item $item) => StockStatus::of(
            $item->batches->sum(fn (Batch $batch) => $batch->availableQuantity()),
            $item->min_qty,
        );
        $hasBatch = fn (ExpiryStatus $expiry) => $items
            ->filter(fn (Item $item) => $item->batches->contains(fn (Batch $batch) => $batch->expiryStatus() === $expiry))
            ->count();
        $byStatus = $items->countBy(fn (Item $item) => $status($item)->value);

        return [
            'totalItems' => $items->count(),
            'availableCount' => $byStatus[StockStatus::Available->value] ?? 0,
            'lowStockCount' => $byStatus[StockStatus::LowStock->value] ?? 0,
            'outOfStockCount' => $byStatus[StockStatus::OutOfStock->value] ?? 0,
            'expiringSoonCount' => $hasBatch(ExpiryStatus::ExpiringSoon),
            'expiredCount' => $hasBatch(ExpiryStatus::Expired),
        ];
    }

    /**
     * GET /dashboard/stock-movement?months=: one entry per calendar month, oldest first, the
     * current month last, including months with no movement.
     *
     * Values in money, decided 2026-11-19 (instead of quantities, which added boxes to bottles):
     * each transaction counts quantity x the unit cost stored on it, the same value the
     * movement_history report shows (incoming: the purchase price; outgoing: the Average Cost
     * snapshot). By transaction date; cancelled transactions excluded; archived items' history
     * included.
     *
     *   incoming   value received
     *   outgoing   value issued for use
     *   disposed   value of expired stock disposed of: apart, it is not consumption
     *
     * @return list<array{month: string, incoming: float, outgoing: float, disposed: float}>
     */
    public function stockMovement(int $months): array
    {
        $first = today()->startOfMonth()->subMonths($months - 1);

        $totals = [];
        for ($month = $first->copy(); $month->lessThanOrEqualTo(today()); $month->addMonth()) {
            $totals[$month->format('Y-m')] = ['incoming' => 0.0, 'outgoing' => 0.0, 'disposed' => 0.0];
        }

        Transaction::active()
            ->whereDate('date', '>=', $first)
            ->whereDate('date', '<=', today())
            ->get(['type', 'reason', 'quantity', 'unit_cost', 'date'])
            ->each(function (Transaction $transaction) use (&$totals) {
                $column = match (true) {
                    $transaction->isIncoming() => 'incoming',
                    $transaction->reason === OutgoingReason::ExpiredDisposal => 'disposed',
                    default => 'outgoing',
                };
                // The value the movement_history row of this transaction shows, so a month adds
                // up to the report's totalValue column.
                $totals[$transaction->date->format('Y-m')][$column] += $this->reports->value($transaction);
            });

        // Each value is already in cents; rounding the sums only removes floating-point noise.
        return array_map(
            fn (string $month, array $values) => ['month' => $month, ...array_map(fn (float $value) => round($value, 2), $values)],
            array_keys($totals),
            $totals,
        );
    }

    /**
     * GET /dashboard/recent-transactions?search=&limit=: the newest ACTIVE transactions of both
     * types (cancelled ones are left out). search matches the item name, the type, the
     * recorder's name and the batch number, like the mock.
     *
     * @return Collection<int, Transaction>
     */
    public function recentTransactions(?string $search, int $limit): Collection
    {
        $search = trim((string) $search);
        $like = '%'.addcslashes($search, '%_\\').'%';

        return Transaction::active()
            ->with('batch')
            ->withCount('revisions')
            ->when($search !== '', fn (Builder $query) => $query->where(fn (Builder $q) => $q
                ->where('type', 'like', $like)
                ->orWhereHas('item', fn (Builder $q) => $q->where('name', 'like', $like))
                ->orWhereHas('recorder', fn (Builder $q) => $q->where('name', 'like', $like))
                ->orWhereHas('batch', fn (Builder $q) => $q->where('batch_number', 'like', $like))))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();
    }
}
