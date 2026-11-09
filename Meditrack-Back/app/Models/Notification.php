<?php

namespace App\Models;

use App\Enums\NotificationType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An alert condition that currently exists. key ("low_stock-4", "expiring-9") is the id the API
 * returns. first_seen_at is returned as createdAt.
 */
#[Table(timestamps: false)]
#[Fillable(['key', 'type', 'item_id', 'batch_id', 'first_seen_at'])]
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

    /** Which users have read this alert. */
    public function reads(): HasMany
    {
        return $this->hasMany(NotificationRead::class);
    }
}
