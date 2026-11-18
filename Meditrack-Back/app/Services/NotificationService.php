<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Enums\StockStatus;
use App\Enums\TransactionType;
use App\Enums\UserRole;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Notification;
use App\Models\NotificationRead;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * SHARED CONTRACT. Owner: Developer B (phase 4). Called by Developer A after every stock change.
 * The signatures are agreed: change them only together. BACKEND_HANDOFF.md section 4.6.
 *
 * The notifications table holds the alert conditions that exist right now. A sync compares it
 * with the current state: it adds the alerts that started (first_seen_at = now) and deletes the
 * ones that were resolved, with their read state. An alert that stays keeps its id and createdAt.
 *
 * Only WHICH alerts exist is stored. Their figures (quantity, minQty, expiryStatus, daysLeft) are
 * worked out when they are read, so they always match the inventory.
 */
class NotificationService
{
    /** An account alert is raised from this many days before account_expires_on. */
    public const ACCOUNT_WARNING_DAYS = 7;

    /** Cache key: the day syncAll last ran (see syncOncePerDay). */
    private const SYNCED_ON = 'notifications.synced_on';

    /**
     * Brings one item's alerts up to date: low_stock / out_of_stock for the item, and expiring for
     * each of its batches. An archived item ends up with none.
     *
     * Call it at the end of the same DB::transaction that changed the item, after its stock and
     * Average Cost were recalculated:
     *   - Developer A: StockService calls it once per affected item, which covers incoming,
     *     outgoing, disposal, edit and cancel (an edit that moves a transaction to another item
     *     syncs both items).
     *   - Developer B: archive, restore, and an edit of min_qty in PUT /inventory/{item}.
     */
    public function syncItem(Item $item): void
    {
        $this->sync(
            Notification::query()->where('item_id', $item->id),
            $this->itemAlerts($item->fresh()),
        );
    }

    /**
     * Brings one account's alerts up to date: account_expiring / account_expires_today for an
     * active storekeeper, none otherwise.
     *
     * Called by Developer B when a user is created, or its status or account_expires_on changes.
     */
    public function syncUser(User $user): void
    {
        $this->sync(
            Notification::query()->where('user_id', $user->id),
            $this->accountAlerts($user->fresh()),
        );
    }

    /**
     * Re-syncs every item and user. Some alerts change with the date alone (a batch becomes
     * expiring soon, an account's last day arrives), so this runs once a day from the scheduler
     * (routes/console.php) and at the end of the demo seeder.
     */
    public function syncAll(): void
    {
        Item::query()->orderBy('id')->each(fn (Item $item) => DB::transaction(function () use ($item) {
            // The same row lock StockService takes, so a stock change on this item waits for
            // this sync (or the other way round) and the two never mix old and new figures.
            Item::query()->whereKey($item->id)->lockForUpdate()->first();
            $this->syncItem($item);
        }));
        User::query()->orderBy('id')->each(fn (User $user) => $this->syncUser($user));

        Cache::forever(self::SYNCED_ON, today()->toDateString());
    }

    // ---- Reading: the endpoints in routes/api/notifications.php -------------------------------

    /**
     * The alerts $viewer may see, in priority order (Notification::priority), each with `read`
     * for $viewer. $search matches the item name, the type as words ("low stock"), the batch
     * number, and for account alerts the account holder's name and "account".
     *
     * @return Collection<int, Notification>
     */
    public function feed(User $viewer, ?string $search = null): Collection
    {
        $this->syncOncePerDay();

        $search = Str::lower(trim((string) $search));

        return $this->visible($viewer)
            ->with([
                'item.batches' => fn ($batches) => $batches->where('quantity', '>', 0),
                'batch',
                'user',
            ])
            ->get()
            ->filter(fn (Notification $alert) => $search === '' || $this->matches($alert, $search))
            ->sortBy(fn (Notification $alert) => $alert->priority())
            ->values();
    }

    /** How many of the alerts $viewer may see they have not read yet (the red dot on the bell). */
    public function unreadCount(User $viewer): int
    {
        $this->syncOncePerDay();

        return Notification::query()
            ->visibleTo($viewer)
            ->whereDoesntHave('reads', fn (Builder $reads) => $reads->where('user_id', $viewer->id))
            ->count();
    }

    /**
     * Marks one alert as read for $viewer only. 404 when it no longer exists (it was resolved) or
     * $viewer may not see it.
     */
    public function markRead(User $viewer, string $key): Notification
    {
        $alert = $this->feed($viewer)->firstWhere('key', $key)
            ?? throw new NotFoundHttpException('This notification no longer exists.');

        $this->addReads($viewer, [$alert->id]);
        $alert->setAttribute('read_by_viewer', true);

        return $alert;
    }

    /** Marks every alert $viewer may see as read, for $viewer only. */
    public function markAllRead(User $viewer): void
    {
        $this->addReads($viewer, $this->visible($viewer)->pluck('id')->all());
    }

    /** Notification::visibleTo, with `read_by_viewer` (true / false) for $viewer. */
    private function visible(User $viewer): Builder
    {
        return Notification::query()
            ->visibleTo($viewer)
            ->withExists(['reads as read_by_viewer' => fn (Builder $reads) => $reads->where('user_id', $viewer->id)]);
    }

    /** insertOrIgnore: an alert already read (or read by a second click meanwhile) is skipped. */
    private function addReads(User $viewer, array $notificationIds): void
    {
        $rows = array_map(fn (int $id) => ['notification_id' => $id, 'user_id' => $viewer->id, 'read_at' => now()], $notificationIds);
        if ($rows !== []) {
            NotificationRead::query()->insertOrIgnore($rows);
        }
    }

    private function matches(Notification $alert, string $search): bool
    {
        $values = [
            $alert->item?->name,
            str_replace('_', ' ', $alert->type->value),
            $alert->batch?->batch_number,
            $alert->user?->name,
        ];

        return collect($values)->contains(fn (?string $value) => $value !== null && str_contains(Str::lower($value), $search));
    }

    /**
     * Some alerts change with the date alone. The scheduler runs syncAll every night
     * (routes/console.php), but on a computer where the scheduler is not running (a demo, a
     * laptop that was off at midnight) the first read of a new day runs it instead.
     */
    private function syncOncePerDay(): void
    {
        if (Cache::get(self::SYNCED_ON) !== today()->toDateString()) {
            $this->syncAll();
        }
    }

    /**
     * The alerts the item should have right now, as key => columns. BACKEND_HANDOFF.md 4.6:
     *   - one stock alert at most: low_stock or out_of_stock, judged on the AVAILABLE stock (an
     *     expired batch never hides a shortage). A never-stocked item raises none.
     *   - one expiring alert per batch that still holds stock and is expired or expiring soon.
     *   - nothing for an archived item.
     */
    private function itemAlerts(Item $item): array
    {
        if ($item->isArchived()) {
            return [];
        }

        $alerts = [];
        $batches = $item->batches()->where('quantity', '>', 0)->orderBy('id')->get();

        $available = $batches->sum(fn (Batch $batch) => $batch->availableQuantity());
        $status = StockStatus::of($available, $item->min_qty);
        if ($status !== StockStatus::Available && $this->hasReceivedStock($item)) {
            $type = $status === StockStatus::OutOfStock ? NotificationType::OutOfStock : NotificationType::LowStock;
            $alerts["{$type->value}-{$item->id}"] = ['type' => $type, 'item_id' => $item->id, 'batch_id' => null];
        }

        foreach ($batches as $batch) {
            if ($batch->expiryStatus() !== null) {
                $type = NotificationType::Expiring;
                $alerts["{$type->value}-{$batch->id}"] = ['type' => $type, 'item_id' => $item->id, 'batch_id' => $batch->id];
            }
        }

        return $alerts;
    }

    /**
     * The alert the account should have right now, as key => columns: account_expires_today on
     * its last day, account_expiring while 1-7 days are left. Only an active storekeeper with an
     * expiry date gets one; there is none once the account has expired.
     */
    private function accountAlerts(User $user): array
    {
        if ($user->role !== UserRole::Storekeeper || ! $user->isActive() || $user->account_expires_on === null) {
            return [];
        }

        $daysLeft = (int) today()->diffInDays($user->account_expires_on, false);
        $type = match (true) {
            $daysLeft === 0 => NotificationType::AccountExpiresToday,
            $daysLeft >= 1 && $daysLeft <= self::ACCOUNT_WARNING_DAYS => NotificationType::AccountExpiring,
            default => null,
        };

        return $type === null ? [] : ["{$type->value}-{$user->id}" => ['type' => $type, 'user_id' => $user->id]];
    }

    /** True once the item has an active receipt: a brand-new item is not "out of stock". */
    private function hasReceivedStock(Item $item): bool
    {
        return $item->transactions()->active()->where('type', TransactionType::Incoming)->exists();
    }

    /**
     * Makes the stored alerts in $current match $wanted (key => columns): deletes the stored ones
     * that are no longer wanted (their read marks go with them, by cascade) and adds the missing
     * ones, first seen now and unread for everyone. An alert in both is left as it is.
     */
    private function sync(Builder $current, array $wanted): void
    {
        $current->clone()->whereNotIn('key', array_keys($wanted))->delete();

        $stored = $current->clone()->pluck('key')->all();
        $rows = [];
        foreach (array_diff_key($wanted, array_flip($stored)) as $key => $columns) {
            $rows[] = [
                'key' => $key,
                'type' => $columns['type']->value,
                'item_id' => $columns['item_id'] ?? null,
                'batch_id' => $columns['batch_id'] ?? null,
                'user_id' => $columns['user_id'] ?? null,
                'first_seen_at' => now(),
            ];
        }

        // insertOrIgnore: if another request added the same alert a moment ago, the unique key
        // keeps the first one instead of failing this request.
        if ($rows !== []) {
            Notification::query()->insertOrIgnore($rows);
        }
    }
}
