<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A user as the Users page sees it: BACKEND_HANDOFF.md, "User". Never the password.
 * transactionsCount needs withCount() first: see UserService::list().
 *
 * @mixin \App\Models\User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'status' => $this->status->value,
            'phone' => $this->phone ?? '',
            'lastActiveAt' => $this->last_active_at?->toISOString(),
            'transactionsCount' => (int) $this->transactions_count,
            'accountExpiresOn' => $this->account_expires_on?->toDateString(),
            'accountExpired' => $this->isAccountExpired(),
        ];
    }
}
