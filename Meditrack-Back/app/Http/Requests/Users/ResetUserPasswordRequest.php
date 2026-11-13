<?php

namespace App\Http\Requests\Users;

use Illuminate\Foundation\Http\FormRequest;

/** PUT /api/users/{user}/password: BACKEND_HANDOFF.md section 4.2. */
class ResetUserPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'newPassword' => ['required', 'string', 'min:6', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return UserRules::messages();
    }
}
