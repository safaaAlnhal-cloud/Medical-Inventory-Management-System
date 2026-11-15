<?php

namespace App\Http\Requests\Items;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/inventory/{item}/barcodes: BACKEND_HANDOFF.md "Barcodes and manufacturers".
 * Only the shape: a barcode already in use and an archived item (409) are checked by
 * BarcodeService.
 */
class LinkBarcodeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // item_barcodes.barcode holds 64 characters. \S+ means "one or more characters, none of
            // them a space". Barcodes are compared exactly, so nothing else is changed.
            'barcode' => ['required', 'string', 'max:64', 'regex:/^\S+$/'],
            // The manufacturer's name: an existing one (any spelling) or a new one.
            'manufacturer' => ['required', 'string', 'max:150'],
        ];
    }

    public function messages(): array
    {
        return [
            'barcode.required' => 'Enter the barcode.',
            'barcode.string' => 'The barcode must be text.',
            'barcode.max' => 'The barcode may not be longer than 64 characters.',
            'barcode.regex' => 'The barcode may not contain spaces.',
            'manufacturer.required' => 'Enter the manufacturer of this barcode.',
            'manufacturer.string' => 'The manufacturer must be text.',
            'manufacturer.max' => 'Manufacturer may not be longer than 150 characters.',
        ];
    }
}
