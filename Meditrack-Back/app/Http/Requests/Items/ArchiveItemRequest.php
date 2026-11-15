<?php

namespace App\Http\Requests\Items;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /api/inventory/{item}/archive: BACKEND_HANDOFF.md "Archived items" (decision 22).
 * Only the reason: an item with stock or already archived (409) is checked by ItemService.
 */
class ArchiveItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // item_archivals.reason holds up to 500 characters. Only spaces count as empty.
            'reason' => ['required', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Please enter the reason for deactivating this item.',
            'reason.string' => 'The reason must be text.',
            'reason.max' => 'The reason may not be longer than 500 characters.',
        ];
    }
}
