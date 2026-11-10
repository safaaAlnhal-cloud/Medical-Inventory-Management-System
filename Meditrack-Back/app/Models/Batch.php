<?php

namespace App\Models;

use App\Enums\TransactionStatus;
use App\Enums\TransactionType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A batch is created by an incoming transaction. quantity is not fillable: it is a cached value
 * that only StockService writes.
 */
#[Fillable([
    'item_id', 'manufacturer_id', 'batch_number', 'unit_cost', 'supplier', 'manufacturing_date',
    'expiry_date',
])]
class Batch extends Model
{
    use HasFactory;

    // The migration's default: StockService fills the real quantity.
    protected $attributes = [
        'quantity' => 0,
    ];

    protected function casts(): array
    {
        return [
            'unit_cost' => 'decimal:4',
            'manufacturing_date' => 'date',
            'expiry_date' => 'date',
            'quantity' => 'integer',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /** null when the manufacturer is unknown. */
    public function manufacturer(): BelongsTo
    {
        return $this->belongsTo(Manufacturer::class);
    }

    /** Every transaction that references this batch: its receipt, issues and disposals. */
    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /**
     * The active incoming transaction that received this batch. A batch without one (its receipt
     * was cancelled or turned into an outgoing transaction) is out of stock, but its record is kept
     * so its number still resolves.
     */
    public function receipt(): HasOne
    {
        return $this->hasOne(Transaction::class)
            ->where('type', TransactionType::Incoming)
            ->where('status', TransactionStatus::Active);
    }
}
