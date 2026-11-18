<?php

namespace App\Http\Requests\Notifications;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /notifications?search= and GET /dashboard/alerts?search=&limit=. Both are optional;
 * limit (1-50) is only read by /dashboard/alerts.
 */
class ListNotificationsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:255'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }

    public function messages(): array
    {
        return [
            'search.string' => 'The search must be text.',
            'search.max' => 'The search may not be longer than 255 characters.',
            'limit.integer' => 'The limit must be a whole number from 1 to 50.',
            'limit.min' => 'The limit must be a whole number from 1 to 50.',
            'limit.max' => 'The limit must be a whole number from 1 to 50.',
        ];
    }
}
