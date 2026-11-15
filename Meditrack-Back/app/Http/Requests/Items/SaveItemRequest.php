<?php

namespace App\Http\Requests\Items;

use App\Enums\Unit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /api/inventory and PUT /api/inventory/{item}: BACKEND_HANDOFF.md section 4.4.
 * Only the shape: a name used by another active item (409) and an archived item (409) are
 * checked by ItemService. Barcodes are not part of the form: they have their own endpoints.
 */
class SaveItemRequest extends FormRequest
{
    /** The longest minQty accepted. The column is unsigned, so this keeps far away from its end. */
    public const MAX_MIN_QTY = 1000000;

    /** The six optional details and their length limits (the items table columns). */
    public const DETAILS = [
        'activeIngredient' => 150,
        'strength' => 50,
        'dosageForm' => 50,
        'storageConditions' => 255,
        'uses' => 1000,
        'description' => 2000,
    ];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:150'],
            'categoryId' => ['required', 'integer', Rule::exists('categories', 'id')],
            'unit' => ['required', Rule::enum(Unit::class)],
            'minQty' => ['required', 'integer', 'min:0', 'max:'.self::MAX_MIN_QTY],
        ];

        // Optional: a detail that is not sent stays as it is; null or empty clears it.
        foreach (self::DETAILS as $field => $limit) {
            $rules[$field] = ['sometimes', 'nullable', 'string', "max:{$limit}"];
        }

        return $rules;
    }

    public function messages(): array
    {
        $category = 'Please choose a valid category.';
        $unit = 'Please choose a valid unit.';
        $minQty = 'Minimum quantity must be zero or more.';

        $messages = [
            'name.required' => 'Item name is required.',
            'name.string' => 'Item name must be text.',
            'name.max' => 'Item name may not be longer than 150 characters.',
            'categoryId.required' => $category,
            'categoryId.integer' => $category,
            'categoryId.exists' => $category,
            'unit.required' => $unit,
            'unit.enum' => $unit,
            'minQty.required' => $minQty,
            'minQty.integer' => 'Minimum quantity must be a whole number.',
            'minQty.min' => $minQty,
            'minQty.max' => 'Minimum quantity may not be more than '.number_format(self::MAX_MIN_QTY).'.',
        ];

        foreach (self::DETAILS as $field => $limit) {
            $messages["{$field}.string"] = 'This field must be text.';
            $messages["{$field}.max"] = "This field may not be longer than {$limit} characters.";
        }

        return $messages;
    }
}
