<?php

namespace App\Http\Resources;

use App\Enums\StockStatus;
use App\Models\Batch;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An inventory item as the frontend sees it: BACKEND_HANDOFF.md section 3, "Inventory item".
 * Load it through ItemService (withFigures), which loads the batches in stock, the barcodes,
 * the open archiving, the archive count and the disposed quantity this resource reads.
 *
 * Only name, category, unit, minQty, the six details and the archive state are stored on the item.
 * Every stock figure is worked out here from the batches and today's date, because it changes
 * with the date alone (a batch expires overnight).
 *
 * @mixin \App\Models\Item
 */
class ItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $batches = $this->batches;
        $quantity = $batches->sum(fn (Batch $batch) => $batch->availableQuantity());

        return [
            'id' => $this->id,
            'name' => $this->name,
            'categoryId' => $this->category_id,
            'unit' => $this->unit->value,
            'minQty' => $this->min_qty,
            'quantity' => $quantity,
            'expiredQuantity' => $batches->sum(fn (Batch $batch) => $batch->expiredQuantity()),
            'disposedQuantity' => (int) $this->disposed_quantity,
            'status' => StockStatus::of($quantity, $this->min_qty)->value,
            'avgUnitCost' => (float) $this->avg_unit_cost,
            // The next date usable stock expires: an expired batch is no longer "about to" expire.
            'nearestExpiryDate' => $batches
                ->filter(fn (Batch $batch) => $batch->availableQuantity() > 0 && $batch->expiry_date !== null)
                ->min(fn (Batch $batch) => $batch->expiry_date->toDateString()),
            'batches' => $batches->map(fn (Batch $batch) => [
                'id' => $batch->id,
                'batchNumber' => $batch->batch_number,
                'quantity' => $batch->quantity,
                'availableQuantity' => $batch->availableQuantity(),
                'expiredQuantity' => $batch->expiredQuantity(),
                'unitCost' => (float) $batch->unit_cost,
                'supplier' => $batch->supplier,
                'manufacturerId' => $batch->manufacturer_id,
                'manufacturingDate' => $batch->manufacturing_date?->toDateString(),
                'expiryDate' => $batch->expiry_date?->toDateString(),
                'expiryStatus' => $batch->expiryStatus()?->value,
            ])->values(),
            'activeIngredient' => $this->active_ingredient,
            'strength' => $this->strength,
            'dosageForm' => $this->dosage_form,
            'storageConditions' => $this->storage_conditions,
            'uses' => $this->uses,
            'description' => $this->description,
            'barcodes' => $this->barcodes->map(fn ($barcode) => [
                'id' => $barcode->id,
                'barcode' => $barcode->barcode,
                'manufacturerId' => $barcode->manufacturer_id,
            ])->values(),
            'archived' => $this->isArchived(),
            'archivedAt' => $this->archived_at?->toISOString(),
            'archiveReason' => $this->currentArchival?->reason,
            'archivedBy' => $this->currentArchival?->archived_by,
            'archiveHistoryCount' => (int) $this->archivals_count,
        ];
    }
}
