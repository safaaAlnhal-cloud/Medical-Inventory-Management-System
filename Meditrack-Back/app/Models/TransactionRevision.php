<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One edit of a transaction. old_values / new_values hold only the fields that changed,
 * e.g. ["quantity" => 100] → ["quantity" => 80]. edited_at replaces created_at / updated_at:
 * a revision is written once and never changed.
 */
#[Table(timestamps: false)]
#[Fillable(['transaction_id', 'edited_by', 'edited_at', 'old_values', 'new_values'])]
class TransactionRevision extends Model
{
    protected function casts(): array
    {
        return [
            'edited_at' => 'datetime',
            // Stored as JSON text in the database, used as a PHP array in the code.
            'old_values' => 'array',
            'new_values' => 'array',
        ];
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class);
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'edited_by');
    }
}
