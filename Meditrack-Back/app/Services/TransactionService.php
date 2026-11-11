<?php

namespace App\Services;

use App\Enums\TransactionType;
use App\Exceptions\ConflictException;
use App\Models\Batch;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Recording and listing transactions. Owner: Developer A. BACKEND_HANDOFF.md section 4.5.
 * Every change to stock goes through StockService (lock, save, recalculate).
 */
class TransactionService
{
    public function __construct(
        private readonly StockService $stock,
        private readonly ManufacturerService $manufacturers,
    ) {}

    /**
     * GET /transactions/{incoming|outgoing}: every transaction of that type, cancelled ones
     * included (the page shows them with a badge), newest first.
     *
     * @param  array{search?: ?string, itemId?: ?int, from?: ?string, to?: ?string}  $filters
     * @return Collection<int, Transaction>
     */
    public function list(TransactionType $type, array $filters): Collection
    {
        $search = trim((string) ($filters['search'] ?? ''));

        return Transaction::query()
            ->where('type', $type)
            ->with('batch')
            ->when($filters['itemId'] ?? null, fn (Builder $q, $itemId) => $q->where('item_id', $itemId))
            ->when($filters['from'] ?? null, fn (Builder $q, $from) => $q->whereDate('date', '>=', $from))
            ->when($filters['to'] ?? null, fn (Builder $q, $to) => $q->whereDate('date', '<=', $to))
            ->when($search !== '', fn (Builder $q) => $this->whereMatches($q, $search))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();
    }

    /**
     * POST /transactions/incoming: receives stock into a new batch.
     *
     * Everything happens in one database transaction: if any rule fails, no batch, no
     * manufacturer and no stock change is left behind.
     *
     * @param  array<string, mixed>  $data  validated by StoreIncomingTransactionRequest
     *
     * @throws ValidationException  422 on itemId: the item is archived
     * @throws ConflictException   409 on batchNumber: the number is in use for this item and manufacturer
     */
    public function recordIncoming(array $data, User $recordedBy): Transaction
    {
        return DB::transaction(function () use ($data, $recordedBy) {
            $item = $this->stock->lockItems($data['itemId'])->first();

            if ($item->isArchived()) {
                throw ValidationException::withMessages([
                    'itemId' => "\"{$item->name}\" is deactivated. Reactivate it before recording transactions for it.",
                ]);
            }

            $manufacturer = filled($data['manufacturer'] ?? null)
                ? $this->manufacturers->resolve($data['manufacturer'])
                : null;

            $this->ensureBatchNumberIsFree($item->id, $manufacturer?->id, $data['batchNumber']);

            $batch = Batch::create([
                'item_id' => $item->id,
                'manufacturer_id' => $manufacturer?->id,
                'batch_number' => $data['batchNumber'],
                'unit_cost' => $data['unitCost'],
                'supplier' => $data['supplier'] ?? null,
                'manufacturing_date' => $data['manufacturingDate'] ?? null,
                'expiry_date' => $data['expiryDate'] ?? null,
            ]);

            $transaction = Transaction::create([
                'type' => TransactionType::Incoming,
                'item_id' => $item->id,
                'batch_id' => $batch->id,
                'quantity' => $data['quantity'],
                'unit_cost' => $data['unitCost'],
                'date' => $data['date'],
                // From the token: the request never says who recorded it.
                'recorded_by' => $recordedBy->id,
            ]);

            $this->stock->recalculate($item);

            return $transaction->setRelation('batch', $batch);
        });
    }

    /**
     * A batch number is unique per item and manufacturer, among batches whose receipt is still
     * active (a cancelled receipt frees its number). Batches with no manufacturer form one group.
     * Compared without regard to letter case: "PC-101" and "pc-101" are the same batch.
     */
    private function ensureBatchNumberIsFree(int $itemId, ?int $manufacturerId, string $batchNumber, ?int $exceptBatchId = null): void
    {
        $taken = Batch::where('item_id', $itemId)
            ->where('manufacturer_id', $manufacturerId)   // where(..., null) is "IS NULL"
            ->whereRaw('LOWER(batch_number) = ?', [mb_strtolower($batchNumber)])
            ->when($exceptBatchId, fn (Builder $q) => $q->whereKeyNot($exceptBatchId))
            ->whereHas('receipt')
            ->exists();

        if ($taken) {
            throw ConflictException::on('batchNumber', "Batch {$batchNumber} already exists for this item from the same manufacturer. Please use a different batch number.");
        }
    }

    /** search: item name, batch number, supplier, recipient, manufacturer, the recorder's name. */
    private function whereMatches(Builder $query, string $search): void
    {
        $like = '%'.addcslashes($search, '%_\\').'%';

        $query->where(fn (Builder $q) => $q
            ->where('recipient', 'like', $like)
            ->orWhereHas('item', fn (Builder $q) => $q->where('name', 'like', $like))
            ->orWhereHas('recorder', fn (Builder $q) => $q->where('name', 'like', $like))
            ->orWhereHas('batch', fn (Builder $q) => $q
                ->where('batch_number', 'like', $like)
                ->orWhere('supplier', 'like', $like)
                ->orWhereHas('manufacturer', fn (Builder $q) => $q->where('name', 'like', $like))));
    }
}
