<?php

namespace App\Http\Requests\Manufacturers;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/** GET /manufacturers?search=: BACKEND_HANDOFF.md section 4.4. */
class SearchManufacturersRequest extends FormRequest
{
    // Any signed-in user may search: auth:sanctum on the route already checked that.
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Optional. A manufacturer name is at most 150 characters, so a longer search can
            // never match one.
            'search' => ['nullable', 'string', 'max:150'],
        ];
    }

    public function messages(): array
    {
        return [
            'search.string' => 'The search must be text.',
            'search.max' => 'The search may not be longer than 150 characters.',
        ];
    }
}
