<?php

namespace App\Models;

use App\Enums\NotificationType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An alert condition that currently exists. key ("low_stock-4", "expiring-9",
 * "account_expiring-3") is the id the API returns. first_seen_at is returned as createdAt.
 * Stock and expiry alerts have item_id (and batch_id); account alerts have user_id.
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
}
