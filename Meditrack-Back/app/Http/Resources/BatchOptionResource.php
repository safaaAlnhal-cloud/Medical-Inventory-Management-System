<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of a batch list the Outgoing forms choose from: BACKEND_HANDOFF.md section 4.5,
 * batch-options. quantity is what can be issued from it: 0 for an expired batch, which is
 * listed (last) only so the form can say why it cannot be chosen.
 *
 * In the edit form's list (TransactionService::batchOptionsForEdit) quantity is what is
 * available to that one transaction, set on the batch as option_quantity.
 */
class BatchOptionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'batchNumber' => $this->batch_number,
            'quantity' => $this->resource->getAttribute('option_quantity') ?? $this->availableQuantity(),
            'expiryDate' => $this->expiry_date?->toDateString(),
            'expiryStatus' => $this->expiryStatus()?->value,
            'manufacturerId' => $this->manufacturer_id,
        ];
    }
}
