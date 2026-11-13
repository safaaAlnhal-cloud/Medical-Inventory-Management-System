<?php

namespace App\Http\Requests\Users;

/**
 * The validation messages shared by the user requests. The same wording as the mock in
 * src/services/usersApi.js, so the forms show the same text with or without the backend.
 */
final class UserRules
{
    public const PAST_DATE = 'The account expiry date cannot be in the past.';

    public static function messages(): array
    {
        $password = 'The password must be at least 6 characters.';

        return [
            'name.required' => 'Full name is required.',
            'name.string' => 'Full name must be text.',
            'name.max' => 'Full name may not be longer than 255 characters.',
            'email.required' => 'Please enter a valid email address.',
            'email.string' => 'Please enter a valid email address.',
            'email.email' => 'Please enter a valid email address.',
            'email.max' => 'The email may not be longer than 255 characters.',
            'password.required' => $password,
            'password.string' => $password,
            'password.min' => $password,
            'password.max' => 'The password may not be longer than 255 characters.',
            'newPassword.required' => $password,
            'newPassword.string' => $password,
            'newPassword.min' => $password,
            'newPassword.max' => 'The password may not be longer than 255 characters.',
            'role.in' => 'Only storekeeper accounts can be created.',
            'status.required' => 'Please choose a valid account status.',
            'status.enum' => 'Please choose a valid account status.',
            'accountExpiresOn.date_format' => 'Please enter a valid date.',
            'accountExpiresOn.after_or_equal' => self::PAST_DATE,
        ];
    }
}
