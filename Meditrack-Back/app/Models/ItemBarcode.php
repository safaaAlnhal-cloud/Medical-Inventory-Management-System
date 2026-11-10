<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A factory barcode: "this item, made by this manufacturer". Unique in the whole system.
 * Reference data, not history: it may be removed (but not while its item is archived).
 */
#[Fillable(['item_id', 'manufacturer_id', 'barcode'])]
class ItemBarcode extends Model
{
    use HasFactory;

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function manufacturer(): BelongsTo
    {
        return $this->belongsTo(Manufacturer::class);
    }
}
