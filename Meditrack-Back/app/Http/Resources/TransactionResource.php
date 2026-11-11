<?php

namespace App\Http\Resources;

use App\Enums\TransactionType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A transaction as the frontend sees it: BACKEND_HANDOFF.md, "Transaction".
 * Incoming transactions carry their batch's details (supplier, dates, manufacturer), read from
 * the batch they received; outgoing ones carry recipient and reason. Load "batch" first.
 */
class TransactionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $incoming = $this->type === TransactionType::Incoming;

        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'itemId' => $this->item_id,
            'batchId' => $this->batch_id,
            'quantity' => $this->quantity,
            'date' => $this->date->toDateString(),
            'createdAt' => $this->created_at->toISOString(),
            'recordedBy' => $this->recorded_by,
            // decimal:4 is a string ("4.5000"); the frontend expects a number.
            'unitCost' => (float) $this->unit_cost,
            $this->mergeWhen($incoming, fn () => [
                'supplier' => $this->batch->supplier,
                'expiryDate' => $this->batch->expiry_date?->toDateString(),
                'manufacturerId' => $this->batch->manufacturer_id,
                'manufacturingDate' => $this->batch->manufacturing_date?->toDateString(),
            ]),
            $this->mergeWhen(! $incoming, fn () => [
                'recipient' => $this->recipient,
                'reason' => $this->reason?->value,
            ]),
            'status' => $this->status->value,
            'cancelledAt' => $this->cancelled_at?->toISOString(),
            'cancelledBy' => $this->cancelled_by,
        ];
    }
}
