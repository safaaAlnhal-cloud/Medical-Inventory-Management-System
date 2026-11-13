<?php

namespace App\Http\Requests\Users;

use App\Enums\UserStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /api/users/{user}: BACKEND_HANDOFF.md section 4.2. Only the shape: a taken email, deactivating
 * yourself (409) and a date for the admin (422) are checked by UserService.
 */
class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'status' => ['required', Rule::enum(UserStatus::class)],
            // Optional: when it is not sent, the date stays as it is. The "not in the past" check
            // is in UserService, so an expired account's unchanged date can be sent back as it is.
            'accountExpiresOn' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ];
    }

    public function messages(): array
    {
        return UserRules::messages();
    }
}
