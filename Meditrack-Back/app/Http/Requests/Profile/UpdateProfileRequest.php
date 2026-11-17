<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\Users\UserRules;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/profile: BACKEND_HANDOFF.md section 4.9. The same name and email rules as
 * PUT /users/{user}. A taken email (409) is checked by ProfileService.
 */
class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            // email:filter (PHP's own check) also refuses an address with no dot after the @, such as
            // "a@b", like the frontend's check does. Its message key stays "email.email".
            'email' => ['required', 'string', 'email:filter', 'max:255'],
            // Optional: an empty phone is stored as null. The users table holds up to 30 characters.
            'phone' => ['nullable', 'string', 'max:30'],
        ];
    }

    public function messages(): array
    {
        return [
            ...UserRules::messages(),
            'phone.string' => 'The phone number must be text.',
            'phone.max' => 'The phone number may not be longer than 30 characters.',
        ];
    }
}
