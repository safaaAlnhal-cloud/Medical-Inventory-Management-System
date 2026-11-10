<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One archiving of an item, completed (restored_by / restored_at) when the item is restored.
 * Never changed after that and never deleted.
 */
#[Table(timestamps: false)]
#[Fillable(['item_id', 'reason', 'archived_by', 'archived_at', 'restored_by', 'restored_at'])]
class ItemArchival extends Model
{
    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
            'restored_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function archiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    public function restorer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'restored_by');
    }

    /** Still archived: this is the item's current archiving. */
    public function isOpen(): bool
    {
        return $this->restored_at === null;
    }
}
