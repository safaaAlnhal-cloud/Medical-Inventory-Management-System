<?php

namespace App\Services;

use App\Enums\OutgoingReason;
use App\Enums\TransactionType;
use App\Exceptions\ConflictException;
use App\Models\Batch;
use App\Models\Item;
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
            $this->ensureItemIsActive($item);

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
     * POST /transactions/outgoing: issues usable stock from one batch to a recipient.
     *
     * The limit is the chosen batch's own available quantity, never the item's total. The unit
     * cost is a snapshot of the item's Average Cost right now, stored on the transaction and never
     * recalculated; issuing does not change the Average Cost itself.
     *
     * @param  array<string, mixed>  $data  validated by StoreOutgoingTransactionRequest
     *
     * @throws ValidationException  422 on itemId, batchId, quantity or date
     */
    public function recordIssue(array $data, User $recordedBy): Transaction
    {
        return DB::transaction(function () use ($data, $recordedBy) {
            $item = $this->stock->lockItems($data['itemId'])->first();
            $this->ensureItemIsActive($item);

            // Read after the item is locked, so nobody else issues from it meanwhile.
            $batch = Batch::with('receipt')->where('item_id', $item->id)->find($data['batchId']);
            if ($batch === null || $batch->receipt === null || $batch->quantity <= 0) {
                $this->invalid('batchId', 'The selected batch has no stock for this item.');
            }
            // By today's date, not the transaction's: back-dating cannot issue expired stock.
            if ($batch->isExpired()) {
                $this->invalid('batchId', "Batch {$batch->batch_number} expired on {$this->day($batch->expiry_date)} and cannot be issued. Record an expired stock disposal for it instead.");
            }
            if ($data['quantity'] > $batch->availableQuantity()) {
                $this->invalid('quantity', "Only {$batch->availableQuantity()} available in batch {$batch->batch_number}.");
            }
            if ($batch->receipt->date->greaterThan($data['date'])) {
                $this->invalid('date', "The date cannot be earlier than {$this->day($batch->receipt->date)}, when batch {$batch->batch_number} was received.");
            }

            $transaction = Transaction::create([
                'type' => TransactionType::Outgoing,
                'reason' => OutgoingReason::Issue,
                'item_id' => $item->id,
                'batch_id' => $batch->id,
                'quantity' => $data['quantity'],
                'unit_cost' => $item->avg_unit_cost,
                'recipient' => $data['recipient'],
                'date' => $data['date'],
                'recorded_by' => $recordedBy->id,
            ]);

            $this->stock->recalculate($item);

            return $transaction->setRelation('batch', $batch);
        });
    }

    /**
     * GET /inventory/{item}/batch-options?manufacturerId=: the batches of the item that hold
     * stock, in the order the Outgoing form lists them, so the form never sorts:
     *
     *   1. usable batches of $manufacturerId (when given)
     *   2. the other usable batches
     *   3. expired batches: listed so the form can say why they cannot be issued
     *
     * Within each group the nearest expiry comes first (first expiry, first out); batches that
     * never expire come last. An archived item has nothing to issue: [].
     *
     * @return Collection<int, Batch>
     */
    public function batchOptions(Item $item, ?int $manufacturerId): Collection
    {
        if ($item->isArchived()) {
            return new Collection;
        }

        $group = fn (Batch $batch) => match (true) {
            $batch->isExpired() => 2,
            $manufacturerId !== null && $batch->manufacturer_id === $manufacturerId => 0,
            default => 1,
        };

        return Batch::where('item_id', $item->id)
            ->where('quantity', '>', 0)
            ->whereHas('receipt')
            ->get()
            ->sortBy([
                fn (Batch $a, Batch $b) => $group($a) <=> $group($b),
                fn (Batch $a, Batch $b) => ($a->expiry_date === null) <=> ($b->expiry_date === null),
                fn (Batch $a, Batch $b) => $a->expiry_date <=> $b->expiry_date,
                fn (Batch $a, Batch $b) => $a->id <=> $b->id,
            ])
            ->values();
    }

    private function ensureItemIsActive(Item $item): void
    {
        if ($item->isArchived()) {
            $this->invalid('itemId', "\"{$item->name}\" is deactivated. Reactivate it before recording transactions for it.");
        }
    }

    /** A 422 on one field, in the API's error format. */
    private function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }

    /** A date as it reads in a message: 13 Nov 2026. */
    private function day(\DateTimeInterface $date): string
    {
        return $date->format('j M Y');
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
