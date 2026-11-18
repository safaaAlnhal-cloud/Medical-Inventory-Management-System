<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Enums\StockStatus;
use App\Enums\TransactionType;
use App\Enums\UserRole;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

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
        Item::query()->orderBy('id')->each(fn (Item $item) => $this->syncItem($item));
        User::query()->orderBy('id')->each(fn (User $user) => $this->syncUser($user));
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
