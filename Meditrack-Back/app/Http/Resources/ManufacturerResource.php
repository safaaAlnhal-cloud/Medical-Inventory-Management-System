<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A manufacturer as the frontend sees it: BACKEND_HANDOFF.md, "Manufacturer".
 * normalized_name is only used to match spellings, so it never leaves the backend.
 */
class ManufacturerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
        ];
    }
}
