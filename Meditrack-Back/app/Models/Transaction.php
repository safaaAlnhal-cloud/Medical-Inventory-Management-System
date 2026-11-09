<?php

namespace App\Models;

use App\Enums\OutgoingReason;
use App\Enums\TransactionStatus;
use App\Enums\TransactionType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * status, cancelled_at and cancelled_by are not fillable: only the cancel action sets them.
 */
#[Fillable([
    'type', 'reason', 'item_id', 'batch_id', 'quantity', 'unit_cost', 'recipient', 'date',
    'recorded_by',
])]
class Transaction extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'type' => TransactionType::class,
            'reason' => OutgoingReason::class,
            'status' => TransactionStatus::class,
            'quantity' => 'integer',
            'unit_cost' => 'decimal:4',
            'date' => 'date',
            'cancelled_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(TransactionRevision::class);
    }

    public function isActive(): bool
    {
        return $this->status === TransactionStatus::Active;
    }

    public function isIncoming(): bool
    {
        return $this->type === TransactionType::Incoming;
    }

    public function isDisposal(): bool
    {
        return $this->reason === OutgoingReason::ExpiredDisposal;
    }

    /** Transactions that count in stock, costs and reports: Transaction::active()->get() */
    #[Scope]
    protected function active(Builder $query): void
    {
        $query->where('status', TransactionStatus::Active);
    }

    /**
     * The order the stock and the Average Cost are built up in: when each was saved. id breaks
     * ties between transactions saved in the same second.
     */
    #[Scope]
    protected function inRecordedOrder(Builder $query): void
    {
        $query->orderBy('created_at')->orderBy('id');
    }
}
