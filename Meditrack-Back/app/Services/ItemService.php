<?php

namespace App\Services;

use App\Enums\OutgoingReason;
use App\Exceptions\ConflictException;
use App\Http\Requests\Items\SaveItemRequest;
use App\Models\Batch;
use App\Models\Item;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The Inventory page: BACKEND_HANDOFF.md section 4.4 and "Archived items" in section 3.
 * Items are never deleted. Stock figures are never written here: only StockService does that.
 */
class ItemService
{
    public const NAME_TAKEN = 'An active item with this name already exists.';

    public const ARCHIVED = 'This item is deactivated. Reactivate it before editing it.';

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly StockService $stock,
    ) {}

    /** The active inventory, oldest first, or only the items that match $search. */
    public function list(?string $search): Collection
    {
        return $this->withFigures(Item::query()->active())
            ->tap(fn (Builder $query) => $this->search($query, $search))
            ->orderBy('id')
            ->get();
    }

    /** The archived ("deactivated") items, most recently archived first. */
    public function archived(?string $search): Collection
    {
        return $this->withFigures(Item::query()->archived())
            ->tap(fn (Builder $query) => $this->search($query, $search))
            ->orderByDesc('archived_at')
            ->orderByDesc('id')
            ->get();
    }

    /**
     * Every item, archived ones included, as { id, name, unit, archived }, so old transactions
     * and reports can still show the name of an item that is no longer in the inventory.
     */
    public function lookup(): Collection
    {
        return Item::query()->orderBy('id')->get(['id', 'name', 'unit', 'archived_at']);
    }

    /** A new item has no stock until an incoming transaction is recorded. 409 on "name". */
    public function create(array $data): Item
    {
        $this->ensureNameIsFree($data['name']);

        $item = Item::create([...$this->details($data), ...$this->mainFields($data)]);

        return $this->load($item);
    }

    /**
     * Updates name, category, unit, minQty and the details that were sent. Stock, batches,
     * costs and the archive state are never changed here. 409 when the item is archived, and on
     * "name" when another active item already has the name.
     */
    public function update(Item $item, array $data): Item
    {
        if ($item->isArchived()) {
            throw new ConflictException(self::ARCHIVED);
        }
        $this->ensureNameIsFree($data['name'], $item);

        return DB::transaction(function () use ($item, $data) {
            $item->update([...$this->details($data), ...$this->mainFields($data)]);
            // A new minQty can start or end a low-stock alert.
            if ($item->wasChanged('min_qty')) {
                $this->notifications->syncItem($item);
            }

            return $this->load($item);
        });
    }

    /**
     * Archives ("deactivates") the item: a new history record with the reason, and
     * items.archived_at, in one database transaction so the two always agree.
     * 409 when it is already archived, or while it still has stock: available stock, or expired
     * stock awaiting disposal. Archiving must never make stock disappear from the inventory.
     */
    public function archive(Item $item, string $reason, User $user): Item
    {
        return DB::transaction(function () use ($item, $reason, $user) {
            // Nobody records a receipt for this item until we are done, so the stock we check
            // is still the stock when we archive.
            $item = $this->stock->lockItems($item->id)->first();

            if ($item->isArchived()) {
                throw new ConflictException('This item is already deactivated.');
            }

            $batches = $item->batches()->where('quantity', '>', 0)->get();
            $available = $batches->sum(fn (Batch $batch) => $batch->availableQuantity());
            $expired = $batches->sum(fn (Batch $batch) => $batch->expiredQuantity());
            if ($available > 0) {
                throw new ConflictException("\"{$item->name}\" still has {$available} in stock, so it cannot be deactivated yet. Issue or correct the remaining stock first.");
            }
            if ($expired > 0) {
                throw new ConflictException("\"{$item->name}\" still has {$expired} expired in stock awaiting disposal, so it cannot be deactivated yet. Record the disposal first.");
            }

            $now = now();
            $item->archivals()->create(['reason' => $reason, 'archived_by' => $user->id, 'archived_at' => $now]);
            $item->forceFill(['archived_at' => $now])->save();
            // An archived item has no alerts.
            $this->notifications->syncItem($item);

            return $this->load($item);
        });
    }

    /**
     * Puts an archived item back in the active inventory with all of its history: completes the
     * open history record and clears items.archived_at, in one database transaction.
     * 409 when it is not archived, or an active item now has the same name.
     */
    public function restore(Item $item, User $user): Item
    {
        return DB::transaction(function () use ($item, $user) {
            $item = $this->stock->lockItems($item->id)->first();

            if (! $item->isArchived()) {
                throw new ConflictException('This item is not deactivated.');
            }
            $twin = Item::query()->active()->whereRaw('LOWER(name) = ?', [Str::lower($item->name)])->exists();
            if ($twin) {
                throw new ConflictException("An active item named \"{$item->name}\" already exists. Rename that item before reactivating this one.");
            }

            $now = now();
            $item->archivals()->whereNull('restored_at')->update(['restored_by' => $user->id, 'restored_at' => $now]);
            $item->forceFill(['archived_at' => null])->save();
            // Its alerts come back with it.
            $this->notifications->syncItem($item);

            return $this->load($item);
        });
    }

    /** Every archiving of the item, newest first. Empty if it was never archived. */
    public function archiveHistory(Item $item): Collection
    {
        return $item->archivals()->orderByDesc('archived_at')->orderByDesc('id')->get();
    }

    /** Loads everything ItemResource reads on one item. */
    public function load(Item $item): Item
    {
        return $this->withFigures(Item::query())->findOrFail($item->id);
    }

    /**
     * Adds what ItemResource reads: the batches still holding stock (oldest first), the barcodes,
     * the open archiving, how many times the item was archived, and the quantity its active
     * disposals removed.
     */
    private function withFigures(Builder $query): Builder
    {
        return $query
            ->with([
                'batches' => fn ($batches) => $batches->where('quantity', '>', 0)->orderBy('id'),
                'barcodes' => fn ($barcodes) => $barcodes->orderBy('id'),
                'currentArchival',
            ])
            ->withCount('archivals')
            ->withSum(['transactions as disposed_quantity' => fn ($transactions) => $transactions
                ->active()
                ->where('reason', OutgoingReason::ExpiredDisposal)], 'quantity');
    }

    /**
     * Name, category name, unit or the number of a batch in stock contains $search (case and
     * surrounding spaces ignored), like the search in src/services/inventoryApi.js.
     */
    private function search(Builder $query, ?string $search): void
    {
        $search = Str::lower(trim((string) $search));
        if ($search === '') {
            return;
        }

        $like = "%{$search}%";
        $query->where(fn (Builder $matches) => $matches
            ->where('name', 'like', $like)
            ->orWhere('unit', 'like', $like)
            ->orWhereHas('category', fn (Builder $category) => $category->where('name', 'like', $like))
            ->orWhereHas('batches', fn (Builder $batch) => $batch->where('quantity', '>', 0)->where('batch_number', 'like', $like)));
    }

    /** An item name is unique among ACTIVE items, whatever its case: a name can be reused after archiving. */
    private function ensureNameIsFree(string $name, ?Item $except = null): void
    {
        $taken = Item::query()
            ->active()
            ->whereRaw('LOWER(name) = ?', [Str::lower($name)])
            ->when($except !== null, fn (Builder $query) => $query->whereKeyNot($except->id))
            ->exists();

        if ($taken) {
            throw ConflictException::on('name', self::NAME_TAKEN);
        }
    }

    /** The four required fields, from the request's names to the columns. */
    private function mainFields(array $data): array
    {
        return [
            'name' => $data['name'],
            'category_id' => $data['categoryId'],
            'unit' => $data['unit'],
            'min_qty' => (int) $data['minQty'],
        ];
    }

    /** The details that were sent, to their columns. An empty one is stored as null. */
    private function details(array $data): array
    {
        $details = [];
        foreach (array_keys(SaveItemRequest::DETAILS) as $field) {
            if (array_key_exists($field, $data)) {
                $details[Str::snake($field)] = $data[$field] ?? null;
            }
        }

        return $details;
    }
}
