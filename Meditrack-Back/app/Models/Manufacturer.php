<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A company that makes products. Linked to batches and barcodes, never to an item.
 * Created through ManufacturerService::resolve(), which finds an existing manufacturer by its
 * normalised name before creating one.
 */
#[Fillable(['name', 'normalized_name'])]
class Manufacturer extends Model
{
    use HasFactory;

    /**
     * The form used to compare names: lowercase, with spaces and punctuation removed, so
     * "Pharma Co.", "pharma co" and "PharmaCo" are the same manufacturer.
     */
    public static function normalize(string $name): string
    {
        return preg_replace('/[^\p{L}\p{N}]+/u', '', mb_strtolower($name));
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }

    public function barcodes(): HasMany
    {
        return $this->hasMany(ItemBarcode::class);
    }
}
