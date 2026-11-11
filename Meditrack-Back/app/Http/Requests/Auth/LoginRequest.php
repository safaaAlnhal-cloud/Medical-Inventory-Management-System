<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/auth/login: BACKEND_HANDOFF.md section 4.1.
 * Only checks the shape of the request. Whether the email and password are right, and whether
 * the account may sign in, is decided by AuthService.
 */
class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Login is public: anyone may try to sign in.
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'Enter your email.',
            'email.string' => 'The email must be text.',
            'email.email' => 'Enter a valid email address.',
            'email.max' => 'The email may not be longer than 255 characters.',
            'password.required' => 'Enter your password.',
            'password.string' => 'The password must be text.',
            'password.max' => 'The password may not be longer than 255 characters.',
            'remember.boolean' => 'Remember me must be true or false.',
        ];
    }
}
