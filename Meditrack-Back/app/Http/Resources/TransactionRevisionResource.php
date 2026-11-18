<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One edit of a transaction: BACKEND_HANDOFF.md, "Edit history". oldValues / newValues hold only
 * the fields that changed, with the request's field names and raw values (ids, ISO dates, numbers).
 */
class TransactionRevisionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'transactionId' => $this->transaction_id,
            'editedBy' => $this->edited_by,
            'editedAt' => $this->edited_at->toISOString(),
            // (object): an empty PHP array would otherwise be sent as [] instead of {}.
            'oldValues' => (object) $this->old_values,
            'newValues' => (object) $this->new_values,
        ];
    }
}
