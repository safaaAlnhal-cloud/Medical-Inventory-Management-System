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
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Only the fields the user edits in the item form are fillable. avg_unit_cost is a cached value
 * that only StockService writes, and archived_at is set by the archive / restore actions.
 * Barcodes have their own endpoints and are not part of the item form.
 */
#[Fillable([
    'category_id', 'name', 'unit', 'min_qty',
    'active_ingredient', 'strength', 'dosage_form', 'storage_conditions', 'uses', 'description',
])]
class Item extends Model
{
    use HasFactory;

    // The migration's default: an item that has never received stock has an Average Cost of 0.
    protected $attributes = [
        'avg_unit_cost' => 0,
    ];

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

    public function barcodes(): HasMany
    {
        return $this->hasMany(ItemBarcode::class);
    }

    /** Every archiving of the item, open or completed. */
    public function archivals(): HasMany
    {
        return $this->hasMany(ItemArchival::class);
    }

    /** The open archiving (reason, who, when) while the item is archived; null otherwise. */
    public function currentArchival(): HasOne
    {
        return $this->hasOne(ItemArchival::class)->whereNull('restored_at')->latestOfMany('archived_at');
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
