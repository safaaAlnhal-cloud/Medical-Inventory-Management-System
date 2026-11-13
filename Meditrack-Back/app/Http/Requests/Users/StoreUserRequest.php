<?php

namespace App\Http\Requests\Users;

use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/users: BACKEND_HANDOFF.md section 4.2. Only the shape: a taken email (409) is
 * checked by UserService.
 */
class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Laravel trims every input and turns "" into null, so a name of only spaces fails required.
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:6', 'max:255'],
            // Only storekeepers are created: the one admin comes from the seeder.
            'role' => ['sometimes', 'in:'.UserRole::Storekeeper->value],
            // The last working day. A past date is refused: to stop an account now, set it inactive.
            'accountExpiresOn' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:today'],
        ];
    }

    public function messages(): array
    {
        return UserRules::messages();
    }
}
