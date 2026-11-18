<?php

namespace App\Services;

use App\Enums\OutgoingReason;
use App\Enums\TransactionStatus;
use App\Enums\TransactionType;
use App\Exceptions\ConflictException;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\TransactionRevision;
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
    /** How a disposal is named on screen (OUTGOING_REASON_LABELS in the frontend); search matches it. */
    private const DISPOSAL_LABEL = 'Expired Stock Disposal';

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
            ->withCount('revisions')
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
        return $this->recordOutgoing($data, $recordedBy, OutgoingReason::Issue);
    }

    /**
     * POST /transactions/disposal: records that expired stock was removed from its batch.
     *
     * Stored as an outgoing transaction with reason expired_disposal and no recipient, so it
     * follows the same batch arithmetic as an issue but is never counted as consumption.
     * BACKEND_HANDOFF.md, "Batch expiry and disposal".
     *
     * @param  array<string, mixed>  $data  validated by StoreDisposalTransactionRequest
     *
     * @throws ValidationException  422 on itemId, batchId, quantity or date
     */
    public function recordDisposal(array $data, User $recordedBy): Transaction
    {
        return $this->recordOutgoing($data, $recordedBy, OutgoingReason::ExpiredDisposal);
    }

    /**
     * An issue and a disposal share every step. Only what the batch must be, how much it can
     * give and the earliest date differ:
     *
     *   issue:    a batch that has not expired, up to its available quantity
     *   disposal: a batch that has expired, up to its expired quantity, dated after its expiry
     */
    private function recordOutgoing(array $data, User $recordedBy, OutgoingReason $reason): Transaction
    {
        return DB::transaction(function () use ($data, $recordedBy, $reason) {
            $item = $this->stock->lockItems($data['itemId'])->first();
            $this->ensureItemIsActive($item);

            // Read after the item is locked, so nobody else takes stock from it meanwhile.
            $batch = Batch::with('receipt')->where('item_id', $item->id)->find($data['batchId']);
            if ($batch === null || $batch->receipt === null || $batch->quantity <= 0) {
                $this->invalid('batchId', 'The selected batch has no stock for this item.');
            }

            $disposal = $reason === OutgoingReason::ExpiredDisposal;
            $disposal ? $this->ensureCanDispose($batch, $data) : $this->ensureCanIssue($batch, $data);

            if ($batch->receipt->date->greaterThan($data['date'])) {
                $this->invalid('date', "The date cannot be earlier than {$this->day($batch->receipt->date)}, when batch {$batch->batch_number} was received.");
            }
            if ($disposal && $batch->expiry_date->greaterThanOrEqualTo($data['date'])) {
                $this->invalid('date', "The disposal date must be after {$this->day($batch->expiry_date)}, when batch {$batch->batch_number} expired.");
            }

            $transaction = Transaction::create([
                'type' => TransactionType::Outgoing,
                'reason' => $reason,
                'item_id' => $item->id,
                'batch_id' => $batch->id,
                'quantity' => $data['quantity'],
                'unit_cost' => $item->avg_unit_cost,
                // A disposal has no recipient: its reason says where the stock went.
                'recipient' => $disposal ? null : $data['recipient'],
                'date' => $data['date'],
                'recorded_by' => $recordedBy->id,
            ]);

            $this->stock->recalculate($item);

            return $transaction->setRelation('batch', $batch);
        });
    }

    /**
     * PATCH /transactions/{id}/cancel: the transaction stays in the lists, marked cancelled, and
     * from now on counts nowhere. The item's stock and Average Cost are replayed without it; no
     * other transaction is rewritten (outgoing unit costs stay as they were).
     * BACKEND_HANDOFF.md, "Cancelled transactions".
     *
     *   outgoing (issue or disposal): its quantity goes back to its batch
     *   incoming: its batch leaves stock. Refused while stock issued from that batch is active,
     *             or the batch would go below zero: those outgoing transactions go first.
     *
     * @throws ConflictException 409: already cancelled, the item is archived, or stock issued
     *                           from the batch of this incoming transaction is still active
     */
    public function cancel(Transaction $transaction, User $cancelledBy): Transaction
    {
        return DB::transaction(function () use ($transaction, $cancelledBy) {
            $item = $this->stock->lockItems($transaction->item_id)->first();
            // Read again once the item is locked: someone may have cancelled it meanwhile, or an
            // edit may have moved it to another item (then that item is the one to lock).
            $transaction->refresh();
            if ($transaction->item_id !== $item->id) {
                $item = $this->stock->lockItems($transaction->item_id)->first();
            }

            if (! $transaction->isActive()) {
                throw new ConflictException('This transaction has already been cancelled.');
            }
            $this->ensureCanChange($item);

            if ($transaction->isIncoming()) {
                $issued = (int) Transaction::active()
                    ->where('type', TransactionType::Outgoing)
                    ->where('batch_id', $transaction->batch_id)
                    ->sum('quantity');
                if ($issued > 0) {
                    throw new ConflictException("This incoming transaction cannot be cancelled because {$issued} from batch {$transaction->batch->batch_number} has already been issued. Cancel those outgoing transactions first.");
                }
            }

            $transaction->forceFill([
                'status' => TransactionStatus::Cancelled,
                'cancelled_at' => now(),
                // From the token, like recorded_by.
                'cancelled_by' => $cancelledBy->id,
            ])->save();

            $this->stock->recalculate($item);

            return $transaction->load('batch');
        });
    }

    /**
     * PUT /transactions/{id}: replaces every editable field of an active transaction.
     * BACKEND_HANDOFF.md, "Editing transactions" and "Edit history".
     *
     * Everything is saved in one database transaction (the transaction, its batch, a manufacturer
     * the edit creates, the stock of both items and the revision record), or nothing is.
     *
     *   stays incoming:        the same batch record follows (item, number, cost, dates...). While
     *                          stock issued from that batch is active, the item cannot change,
     *                          the quantity cannot drop below what was issued, and the date
     *                          cannot move past the first issue.
     *   outgoing -> incoming:  its quantity returns to the batch it issued from; it receives a
     *                          new batch.
     *   stays outgoing:        may move to another batch or item, received before this
     *                          transaction was recorded, holding enough stock.
     *   incoming -> outgoing:  its batch leaves stock (refused while stock issued from it is
     *                          active); it then issues from another batch.
     *
     * Unit cost of an outgoing result: its stored snapshot is kept, unless the item changed or it
     * used to be incoming; then it is the item's Average Cost, as for a new outgoing transaction.
     * Other transactions are never rewritten.
     *
     * Expiry, decided 2026-11-17: an edit corrects something that already happened, so stock from
     * a batch that has expired since may be issued as long as the transaction is dated on or
     * before the expiry date (the stock left while it was still usable). A new outgoing
     * transaction is still judged by today.
     *
     * @param  array<string, mixed>  $data  validated by UpdateTransactionRequest
     *
     * @throws ConflictException   409: cancelled, a disposal, an archived item, stock issued from its batch...
     * @throws ValidationException 422 on the field that is wrong
     */
    public function update(Transaction $transaction, array $data, User $editor): Transaction
    {
        return DB::transaction(function () use ($transaction, $data, $editor) {
            $items = $this->stock->lockItems($transaction->item_id, $data['itemId']);
            // Read again under the lock; if another edit moved it to a third item meanwhile, lock that too.
            $transaction->refresh();
            if (! $items->has($transaction->item_id)) {
                $items = $this->stock->lockItems($transaction->item_id, $data['itemId']);
            }
            $oldItem = $items->get($transaction->item_id);
            $item = $items->get($data['itemId']);

            if (! $transaction->isActive()) {
                throw new ConflictException('A cancelled transaction cannot be edited.');
            }
            $this->ensureCanChange($oldItem);
            if ($transaction->isDisposal()) {
                throw new ConflictException('An expired stock disposal cannot be edited. If it is wrong, cancel it and record it again.');
            }
            $this->ensureItemIsActive($item);

            $before = $this->revisionValues($transaction->load('batch'));

            $data['type'] === TransactionType::Incoming->value
                ? $this->editAsIncoming($transaction, $item, $data)
                : $this->editAsOutgoing($transaction, $item, $data);

            if ($oldItem->id !== $item->id) {
                $this->stock->recalculate($oldItem);
            }
            $this->stock->recalculate($item);

            // The new snapshot is the Average Cost after the replay, which no longer counts this
            // transaction as a receipt (the same moment a new outgoing transaction would take it).
            if (! $transaction->isIncoming() && ($oldItem->id !== $item->id || $before['type'] === TransactionType::Incoming->value)) {
                $transaction->forceFill(['unit_cost' => $item->avg_unit_cost])->save();
            }

            $this->recordRevision($transaction, $before, $editor);

            return $transaction->load('batch');
        });
    }

    /** The incoming half of update(): the transaction (re)receives a batch. */
    private function editAsIncoming(Transaction $transaction, Item $item, array $data): void
    {
        $wasIncoming = $transaction->isIncoming();
        $expiryDate = $data['expiryDate'] ?? null;

        // Checked only when one of the dates changes, or the transaction used to be outgoing:
        // an old receipt whose batch has expired since must still be correctable.
        $datesChanged = ! $wasIncoming
            || $transaction->date->toDateString() !== $data['date']
            || $transaction->batch->expiry_date?->toDateString() !== $expiryDate;
        if ($datesChanged && $expiryDate !== null && $expiryDate < $data['date']) {
            $this->invalid('expiryDate', 'Expiry date cannot be before the transaction date: expired stock cannot be received.');
        }

        if ($wasIncoming) {
            $issues = Transaction::active()
                ->where('type', TransactionType::Outgoing)
                ->where('batch_id', $transaction->batch_id)
                ->get();
            $issued = (int) $issues->sum('quantity');
            $number = $transaction->batch->batch_number;

            if ($issued > 0) {
                if ($item->id !== $transaction->item_id) {
                    throw ConflictException::on('itemId', "The item cannot be changed because {$issued} from batch {$number} has already been issued. Cancel those outgoing transactions first.");
                }
                if ($data['quantity'] < $issued) {
                    throw ConflictException::on('quantity', "The quantity cannot be less than {$issued}, which has already been issued from batch {$number}.");
                }
                $firstIssue = $issues->min('date');
                if ($firstIssue->lessThan($data['date'])) {
                    $this->invalid('date', "The date cannot be later than {$this->day($firstIssue)}, when stock from batch {$number} was first issued.");
                }
            }
        }

        $manufacturer = filled($data['manufacturer'] ?? null)
            ? $this->manufacturers->resolve($data['manufacturer'])
            : null;
        $this->ensureBatchNumberIsFree($item->id, $manufacturer?->id, $data['batchNumber'], $wasIncoming ? $transaction->batch_id : null);

        $batchFields = [
            'item_id' => $item->id,
            'manufacturer_id' => $manufacturer?->id,
            'batch_number' => $data['batchNumber'],
            'unit_cost' => $data['unitCost'],
            'supplier' => $data['supplier'] ?? null,
            'manufacturing_date' => $data['manufacturingDate'] ?? null,
            'expiry_date' => $expiryDate,
        ];
        // Stays incoming: the same batch, so outgoing transactions keep pointing at it. Used to be
        // outgoing: a new batch; the one it issued from gets its quantity back in the replay.
        $batch = $wasIncoming ? tap($transaction->batch)->update($batchFields) : Batch::create($batchFields);

        $transaction->forceFill([
            'type' => TransactionType::Incoming,
            'reason' => null,
            'recipient' => null,
            'item_id' => $item->id,
            'batch_id' => $batch->id,
            'quantity' => $data['quantity'],
            'unit_cost' => $data['unitCost'],
            'date' => $data['date'],
        ])->save();
    }

    /** The outgoing half of update(): the transaction issues from a batch received before it. */
    private function editAsOutgoing(Transaction $transaction, Item $item, array $data): void
    {
        $wasIncoming = $transaction->isIncoming();

        if ($wasIncoming) {
            $issued = (int) Transaction::active()
                ->where('type', TransactionType::Outgoing)
                ->where('batch_id', $transaction->batch_id)
                ->sum('quantity');
            if ($issued > 0) {
                throw new ConflictException("This transaction cannot be changed to outgoing because {$issued} from batch {$transaction->batch->batch_number}, which it received, has already been issued. Cancel those outgoing transactions first.");
            }
        }

        // Its own receipt is left out: a transaction cannot issue from the batch it received.
        $batch = Batch::where('item_id', $item->id)->find($data['batchId']);
        $receipt = $batch === null ? null : Transaction::active()
            ->where('type', TransactionType::Incoming)
            ->where('batch_id', $batch->id)
            ->whereKeyNot($transaction->id)
            ->first();
        if ($receipt === null) {
            $this->invalid('batchId', 'The selected batch has no stock for this item.');
        }
        if (! $this->recordedBefore($receipt, $transaction)) {
            $this->invalid('batchId', "Batch {$batch->batch_number} was received after this transaction was recorded, so the transaction cannot issue stock from it.");
        }

        $issuedByOthers = (int) Transaction::active()
            ->where('type', TransactionType::Outgoing)
            ->where('batch_id', $batch->id)
            ->whereKeyNot($transaction->id)
            ->sum('quantity');
        $available = $receipt->quantity - $issuedByOthers;
        if ($data['quantity'] > $available) {
            $this->invalid('quantity', "Only {$available} available in batch {$batch->batch_number}.");
        }
        if ($receipt->date->greaterThan($data['date'])) {
            $this->invalid('date', "The date cannot be earlier than {$this->day($receipt->date)}, when batch {$batch->batch_number} was received.");
        }
        if ($batch->isExpired() && $batch->expiry_date->lessThan($data['date'])) {
            $this->invalid('date', "Batch {$batch->batch_number} expired on {$this->day($batch->expiry_date)}. Stock issued from it must be dated on or before that day.");
        }

        $transaction->forceFill([
            'type' => TransactionType::Outgoing,
            'reason' => OutgoingReason::Issue,
            'recipient' => $data['recipient'],
            'item_id' => $item->id,
            'batch_id' => $batch->id,
            'quantity' => $data['quantity'],
            'date' => $data['date'],
            // unit_cost: kept, or set by update() once the stock is replayed.
        ])->save();
    }

    /**
     * What a revision compares, with the request's field names and raw values (ids, ISO dates,
     * numbers). An incoming transaction is described by its batch's details; an outgoing one by
     * the batch it issues from and its recipient. The manufacturer is kept as manufacturerId.
     *
     * @return array<string, mixed>
     */
    private function revisionValues(Transaction $transaction): array
    {
        $values = [
            'type' => $transaction->type->value,
            'itemId' => $transaction->item_id,
            'quantity' => $transaction->quantity,
            'date' => $transaction->date->toDateString(),
            'unitCost' => (float) $transaction->unit_cost,
        ];

        if ($transaction->isIncoming()) {
            $batch = $transaction->batch;

            return [...$values,
                'batchNumber' => $batch->batch_number,
                'expiryDate' => $batch->expiry_date?->toDateString(),
                'supplier' => $batch->supplier,
                'manufacturerId' => $batch->manufacturer_id,
                'manufacturingDate' => $batch->manufacturing_date?->toDateString(),
            ];
        }

        return [...$values, 'batchId' => $transaction->batch_id, 'recipient' => $transaction->recipient];
    }

    /** Saves only the fields that changed; an edit that changes nothing leaves no record. */
    private function recordRevision(Transaction $transaction, array $before, User $editor): void
    {
        $after = $this->revisionValues($transaction->load('batch'));

        $old = [];
        $new = [];
        // A field one type has and the other has not counts as null on the side that lacks it.
        foreach (array_keys([...$before, ...$after]) as $field) {
            $was = $before[$field] ?? null;
            $is = $after[$field] ?? null;
            if ($was !== $is) {
                $old[$field] = $was;
                $new[$field] = $is;
            }
        }

        if ($old === []) {
            return;
        }

        $transaction->revisions()->create([
            'edited_by' => $editor->id,
            'edited_at' => now(),
            'old_values' => $old,
            'new_values' => $new,
        ]);
    }

    /**
     * GET /transactions/{id}/revisions: the edit history, newest first.
     *
     * @return Collection<int, TransactionRevision>
     */
    public function revisions(Transaction $transaction): Collection
    {
        return $transaction->revisions()->orderByDesc('edited_at')->orderByDesc('id')->get();
    }

    /** The transactions of an archived item are read-only: changing one would change its stock. */
    private function ensureCanChange(Item $item): void
    {
        if ($item->isArchived()) {
            throw new ConflictException("This transaction belongs to \"{$item->name}\", which is deactivated. Reactivate the item to change its transactions.");
        }
    }

    /** Expiry is judged by today's date, not the transaction's: back-dating cannot issue expired stock. */
    private function ensureCanIssue(Batch $batch, array $data): void
    {
        if ($batch->isExpired()) {
            $this->invalid('batchId', "Batch {$batch->batch_number} expired on {$this->day($batch->expiry_date)} and cannot be issued. Record an expired stock disposal for it instead.");
        }
        if ($data['quantity'] > $batch->availableQuantity()) {
            $this->invalid('quantity', "Only {$batch->availableQuantity()} available in batch {$batch->batch_number}.");
        }
    }

    private function ensureCanDispose(Batch $batch, array $data): void
    {
        if (! $batch->isExpired()) {
            $this->invalid('batchId', "Batch {$batch->batch_number} has not expired. Only expired stock can be disposed of.");
        }
        if ($data['quantity'] > $batch->expiredQuantity()) {
            $this->invalid('quantity', "Only {$batch->expiredQuantity()} expired in batch {$batch->batch_number} awaiting disposal.");
        }
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

        $batches = Batch::where('item_id', $item->id)
            ->where('quantity', '>', 0)
            ->whereHas('receipt')
            ->get();

        return $this->inOutgoingFormOrder($batches, $manufacturerId);
    }

    /**
     * GET /transactions/{transaction}/batch-options?itemId=&manufacturerId=: the batches the
     * edit form may choose from when this transaction is (or becomes) an outgoing transaction
     * of $item. Each batch carries option_quantity, what is available TO THIS TRANSACTION:
     *
     *   - its own current quantity counts as available again (it is left out of what was issued)
     *   - the batch it received itself is left out (it cannot issue from its own receipt)
     *   - batches received after this transaction was recorded are left out: the stock replay
     *     runs in recorded order, so it could not issue from them
     *   - an expired batch: what is left in it when the transaction is dated on or before the
     *     expiry date (the stock left while it was usable), otherwise 0. Expired batches are
     *     listed last either way, so the form can say why one cannot be chosen. Judged by the
     *     transaction's stored date: if the edit changes the date, update() checks it again.
     *
     * Same order as batchOptions(). An archived item has nothing to issue: [].
     * The edit itself checks all of this again; this list only spares the form the arithmetic.
     *
     * @return Collection<int, Batch>
     */
    public function batchOptionsForEdit(Transaction $transaction, Item $item, ?int $manufacturerId): Collection
    {
        if ($item->isArchived()) {
            return new Collection;
        }

        $others = Transaction::active()->where('item_id', $item->id)->whereKeyNot($transaction->id);
        $receipts = (clone $others)->where('type', TransactionType::Incoming)->get()->keyBy('batch_id');
        $issued = (clone $others)->where('type', TransactionType::Outgoing)
            ->groupBy('batch_id')
            ->selectRaw('batch_id, SUM(quantity) AS total')
            ->pluck('total', 'batch_id');

        $batches = Batch::whereKey($receipts->keys())
            ->get()
            ->filter(fn (Batch $batch) => $this->recordedBefore($receipts[$batch->id], $transaction));

        $optionQuantities = [];
        foreach ($batches as $batch) {
            // What the batch holds once this transaction's own issue is given back.
            $left = $receipts[$batch->id]->quantity - (int) ($issued[$batch->id] ?? 0);
            if ($left <= 0) {
                continue;
            }
            // An expired batch can still be chosen when the transaction is dated on or before its
            // expiry date: the stock left while it was usable (see update()).
            $usableOnItsDate = ! $batch->isExpired() || $transaction->date->lessThanOrEqualTo($batch->expiry_date);
            $optionQuantities[$batch->id] = $usableOnItsDate ? $left : 0;
        }

        $batches = $batches
            ->filter(fn (Batch $batch) => isset($optionQuantities[$batch->id]))
            // Not a column and never saved: BatchOptionResource shows it as quantity.
            ->each(fn (Batch $batch) => $batch->setAttribute('option_quantity', $optionQuantities[$batch->id]));

        return $this->inOutgoingFormOrder($batches, $manufacturerId);
    }

    /** Whether $a comes before $b in the order stock is replayed in (created_at, then id). */
    private function recordedBefore(Transaction $a, Transaction $b): bool
    {
        return $a->created_at->lessThan($b->created_at)
            || ($a->created_at->equalTo($b->created_at) && $a->id < $b->id);
    }

    /**
     * The order the Outgoing forms list batches in, so they never sort:
     *
     *   1. usable batches of $manufacturerId (when given)
     *   2. the other usable batches
     *   3. expired batches
     *
     * Within each group the nearest expiry comes first (first expiry, first out); batches that
     * never expire come last.
     *
     * @param  Collection<int, Batch>  $batches
     * @return Collection<int, Batch>
     */
    private function inOutgoingFormOrder(Collection $batches, ?int $manufacturerId): Collection
    {
        $group = fn (Batch $batch) => match (true) {
            $batch->isExpired() => 2,
            $manufacturerId !== null && $batch->manufacturer_id === $manufacturerId => 0,
            default => 1,
        };

        return $batches
            ->sortBy([
                fn (Batch $a, Batch $b) => $group($a) <=> $group($b),
                fn (Batch $a, Batch $b) => ($a->expiry_date === null) <=> ($b->expiry_date === null),
                fn (Batch $a, Batch $b) => $a->expiry_date <=> $b->expiry_date,
                fn (Batch $a, Batch $b) => $a->id <=> $b->id,
            ])
            ->values();
    }

    /**
     * GET /inventory/batches/lookup: every batch ever received, so any transaction can show its
     * batch number. Batches that are used up, whose receipt was cancelled or whose item is
     * archived are kept: their old transactions still point at them.
     *
     * @return Collection<int, Batch>
     */
    public function batchLookup(): Collection
    {
        return Batch::query()
            ->orderBy('id')
            ->get(['id', 'item_id', 'batch_number', 'manufacturer_id']);
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

    /**
     * search: item name, batch number, supplier, recipient, manufacturer, the recorder's name,
     * and for disposals their label "Expired Stock Disposal" (so "disposal" finds them all).
     */
    private function whereMatches(Builder $query, string $search): void
    {
        $like = '%'.addcslashes($search, '%_\\').'%';
        $matchesDisposalLabel = str_contains(mb_strtolower(self::DISPOSAL_LABEL), mb_strtolower($search));

        $query->where(fn (Builder $q) => $q
            ->where('recipient', 'like', $like)
            ->when($matchesDisposalLabel, fn (Builder $q) => $q->orWhere('reason', OutgoingReason::ExpiredDisposal))
            ->orWhereHas('item', fn (Builder $q) => $q->where('name', 'like', $like))
            ->orWhereHas('recorder', fn (Builder $q) => $q->where('name', 'like', $like))
            ->orWhereHas('batch', fn (Builder $q) => $q
                ->where('batch_number', 'like', $like)
                ->orWhere('supplier', 'like', $like)
                ->orWhereHas('manufacturer', fn (Builder $q) => $q->where('name', 'like', $like))));
    }
}
