<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\Users\UserRules;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/profile/password: BACKEND_HANDOFF.md section 4.9. Only the shape: whether
 * currentPassword is the right one is checked by ProfileService (422 on "currentPassword").
 */
class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'currentPassword' => ['required', 'string'],
            'newPassword' => ['required', 'string', 'min:6', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            ...UserRules::messages(),
            // The mock gives the same message for an empty and for a wrong current password.
            'currentPassword.required' => UserRules::WRONG_PASSWORD,
            'currentPassword.string' => UserRules::WRONG_PASSWORD,
        ];
    }
}
