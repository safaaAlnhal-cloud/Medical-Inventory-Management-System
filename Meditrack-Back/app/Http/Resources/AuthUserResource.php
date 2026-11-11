<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The signed-in user, as POST /auth/login and GET /auth/me return it:
 * { "id", "name", "email", "role" }. BACKEND_HANDOFF.md section 4.1.
 *
 * @mixin \App\Models\User
 */
class AuthUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
        ];
    }
}
