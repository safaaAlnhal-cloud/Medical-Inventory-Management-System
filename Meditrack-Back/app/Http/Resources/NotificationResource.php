<?php

namespace App\Http\Resources;

use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An alert as the frontend sees it: BACKEND_HANDOFF.md section 3, "Notification". Every field is
 * always sent; the ones that do not apply to the type are null. Load it through
 * NotificationService::feed, which loads the relations and read_by_viewer this resource reads.
 *
 * @mixin Notification
 */
class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $isAccountAlert = $this->type->isAccountAlert();

        return [
            'id' => $this->key,
            'type' => $this->type->value,
            'itemId' => $this->item_id,
            'batchId' => $this->batch_id,
            'quantity' => $this->quantity(),
            'minQty' => $this->minQty(),
            'expiryDate' => $this->batch?->expiry_date?->toDateString(),
            'expiryStatus' => $this->expiryStatus()?->value,
            'userId' => $this->user_id,
            'accountExpiresOn' => $isAccountAlert ? $this->user->account_expires_on->toDateString() : null,
            'daysLeft' => $this->daysLeft(),
            'createdAt' => $this->first_seen_at->toISOString(),
            'read' => (bool) $this->read_by_viewer,
        ];
    }
}
