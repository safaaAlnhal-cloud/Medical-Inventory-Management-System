<?php

namespace App\Http\Requests\Items;

use Illuminate\Foundation\Http\FormRequest;

/** GET /api/inventory and /api/inventory/archived: ?search= is optional text. */
class ListItemsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'search.string' => 'The search must be text.',
            'search.max' => 'The search may not be longer than 255 characters.',
        ];
    }
}
