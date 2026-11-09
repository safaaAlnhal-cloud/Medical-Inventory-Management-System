<?php

namespace App\Models;

use App\Enums\Unit;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Only the four fields the user edits are fillable. avg_unit_cost is a cached value that only
 * StockService writes, and archived_at is set by the archive / restore actions.
 */
#[Fillable(['category_id', 'name', 'unit', 'min_qty'])]
class Item extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'unit' => Unit::class,
            'min_qty' => 'integer',
            'avg_unit_cost' => 'decimal:4',
            'archived_at' => 'datetime',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** Items in the active inventory: Item::active()->get() */
    #[Scope]
    protected function active(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /** "Deactivated" items: Item::archived()->get() */
    #[Scope]
    protected function archived(Builder $query): void
    {
        $query->whereNotNull('archived_at');
    }
}
