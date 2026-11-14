<?php

namespace App\Http\Requests\Categories;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/categories and PUT /api/categories/{category}: BACKEND_HANDOFF.md section 4.3.
 * Both send only { name }. A name already in use (409) is checked by CategoryService.
 */
class SaveCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Laravel trims the input and turns "" into null, so a name of only spaces fails required.
            'name' => ['required', 'string', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Category name is required.',
            'name.string' => 'Category name must be text.',
            'name.max' => 'Category name may not be longer than 100 characters.',
        ];
    }
}
