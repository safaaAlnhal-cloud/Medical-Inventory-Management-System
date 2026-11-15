<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One archiving of an item: BACKEND_HANDOFF.md "Archived items". restoredBy / restoredAt stay
 * null while the item is still archived.
 *
 * @mixin \App\Models\ItemArchival
 */
class ItemArchivalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'itemId' => $this->item_id,
            'reason' => $this->reason,
            'archivedBy' => $this->archived_by,
            'archivedAt' => $this->archived_at->toISOString(),
            'restoredBy' => $this->restored_by,
            'restoredAt' => $this->restored_at?->toISOString(),
        ];
    }
}
