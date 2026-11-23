<?php

namespace App\Models;

use App\Enums\ExpiryStatus;
use App\Enums\NotificationType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An alert condition that currently exists. key ("low_stock-4", "expiring-9",
 * "account_expiring-3") is the id the API returns. first_seen_at is returned as createdAt.
 * Stock and expiry alerts have item_id (and batch_id); account alerts have user_id.
 *
 * Only which alerts exist is stored. The figures below are worked out when the alert is read,
 * from relations loaded by NotificationService::feed (item.batches in stock, batch, user).
 */
#[Table(timestamps: false)]
#[Fillable(['key', 'type', 'item_id', 'batch_id', 'user_id', 'first_seen_at'])]
class Notification extends Model
{
    protected function casts(): array
    {
        return [
            'type' => NotificationType::class,
            'first_seen_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /** Only for expiring alerts. */
    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    /** Only for account alerts: the storekeeper whose account expires. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Which users have read this alert. */
    public function reads(): HasMany
    {
        return $this->hasMany(NotificationRead::class);
    }

    /**
     * The alerts $viewer may see: stock and expiry alerts are for everyone, an account alert only
     * for the admin and the storekeeper whose account it is. BACKEND_HANDOFF.md 4.6.
     */
    #[Scope]
    protected function visibleTo(Builder $query, User $viewer): void
    {
        if (! $viewer->isAdmin()) {
            $query->where(fn (Builder $visible) => $visible->whereNull('user_id')->orWhere('user_id', $viewer->id));
        }
    }

    /**
     * low_stock / out_of_stock: the item's AVAILABLE stock. expiring: what is left in the batch.
     * Account alerts: null.
     */
    public function quantity(): ?int
    {
        return match ($this->type) {
            NotificationType::LowStock, NotificationType::OutOfStock => $this->item->batches
                ->sum(fn (Batch $batch) => $batch->availableQuantity()),
            NotificationType::Expiring => $this->batch->quantity,
            default => null,
        };
    }

    /** The item's minimum stock, on stock alerts only. */
    public function minQty(): ?int
    {
        return $this->isStockAlert() ? $this->item->min_qty : null;
    }

    /** expired or expiring_soon, on expiring alerts only. */
    public function expiryStatus(): ?ExpiryStatus
    {
        return $this->type === NotificationType::Expiring ? $this->batch->expiryStatus() : null;
    }

    /** Days from today to the account's last day (0 = today), on account alerts only. */
    public function daysLeft(): ?int
    {
        return $this->type->isAccountAlert()
            ? (int) today()->diffInDays($this->user->account_expires_on, false)
            : null;
    }

    /**
     * The priority order (decision 24, BACKEND_HANDOFF.md 4.6), as a value to sort on, smallest
     * first:
     *   1 expired batch        oldest expiry date first
     *   2 expiring soon        nearest expiry date first
     *   3 out_of_stock         newest first
     *   4 low_stock            newest first
     *   5 account last day, 6 account expiring     fewest days left first
     * Equal alerts: newest first, then the highest id.
     */
    public function priority(): array
    {
        $newest = -$this->first_seen_at->getTimestamp();
        [$rank, $within] = match ($this->type) {
            NotificationType::Expiring => [
                $this->expiryStatus() === ExpiryStatus::Expired ? 1 : 2,
                $this->batch->expiry_date->toDateString(),
            ],
            NotificationType::OutOfStock => [3, $newest],
            NotificationType::LowStock => [4, $newest],
            NotificationType::AccountExpiresToday => [5, $this->daysLeft()],
            NotificationType::AccountExpiring => [6, $this->daysLeft()],
        };

        return [$rank, $within, $newest, -$this->id];
    }

    private function isStockAlert(): bool
    {
        return $this->type === NotificationType::LowStock || $this->type === NotificationType::OutOfStock;
    }
}
