<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of GET /inventory/batches/lookup: BACKEND_HANDOFF.md section 4.4.
 * Only what turns a batchId into its label; quantities and dates are in the item's details.
 */
class BatchLookupResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'itemId' => $this->item_id,
            'batchNumber' => $this->batch_number,
            'manufacturerId' => $this->manufacturer_id,
        ];
    }
}
