<?php

namespace App\Http\Requests\Transactions;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /transactions/incoming: BACKEND_HANDOFF.md section 4.5, "Validation on create".
 * The shape of each field only. The rules that depend on stored data (an archived item, a batch
 * number already in use) are checked by TransactionService after the item is locked.
 */
class StoreIncomingTransactionRequest extends FormRequest
{
    // Any signed-in user may record stock: auth:sanctum on the route already checked that.
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        // A date rule that names another field fails when that field is empty or invalid, so it
        // is added only when the other date is there to compare with.
        $dateIsValid = $this->isDate('date');
        $expiryIsValid = $this->isDate('expiryDate');

        return [
            'itemId' => ['required', 'integer', 'exists:items,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'unitCost' => ['required', 'numeric', 'min:0', 'max:99999999', 'decimal:0,4'],
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'batchNumber' => ['required', 'string', 'max:100'],
            'expiryDate' => array_filter(['nullable', 'date_format:Y-m-d', $dateIsValid ? 'after_or_equal:date' : null]),
            'supplier' => ['nullable', 'string', 'max:150'],
            'manufacturer' => ['nullable', 'string', 'max:150'],
            'manufacturingDate' => array_filter([
                'nullable', 'date_format:Y-m-d', 'before_or_equal:today',
                $dateIsValid ? 'before_or_equal:date' : null,
                $expiryIsValid ? 'before_or_equal:expiryDate' : null,
            ]),
        ];
    }

    public function messages(): array
    {
        return [
            'itemId.required' => 'Please choose an item from the inventory.',
            'itemId.integer' => 'Please choose an item from the inventory.',
            'itemId.exists' => 'Please choose an item from the inventory.',
            'quantity.required' => 'Quantity is required.',
            'quantity.integer' => 'Quantity must be a whole number.',
            'quantity.min' => 'Quantity must be greater than zero.',
            'quantity.max' => 'Quantity may not be more than 1,000,000.',
            'unitCost.required' => 'Unit cost is required.',
            'unitCost.numeric' => 'Unit cost must be a number.',
            'unitCost.min' => 'Unit cost must be zero or more.',
            'unitCost.max' => 'Unit cost is too large.',
            'unitCost.decimal' => 'Unit cost may have at most 4 decimal places.',
            'date.required' => 'Transaction date is required.',
            'date.date_format' => 'Transaction date is not a valid date.',
            'date.before_or_equal' => 'Transaction date cannot be in the future.',
            'batchNumber.required' => 'Batch number is required.',
            'batchNumber.max' => 'Batch number may not be longer than 100 characters.',
            'expiryDate.date_format' => 'Expiry date is not a valid date.',
            'expiryDate.after_or_equal' => 'Expiry date cannot be before the transaction date: expired stock cannot be received.',
            'supplier.max' => 'Supplier may not be longer than 150 characters.',
            'manufacturer.max' => 'Manufacturer may not be longer than 150 characters.',
            'manufacturingDate.date_format' => 'Manufacturing date is not a valid date.',
            'manufacturingDate.before_or_equal' => 'Manufacturing date cannot be in the future, after the transaction date or after the expiry date.',
        ];
    }

    private function isDate(string $field): bool
    {
        $value = $this->input($field);

        if (! is_string($value)) {
            return false;
        }
        // false for text that is not a date; "2026-02-31" parses as 2026-03-03, so compare back.
        $date = \DateTime::createFromFormat('!Y-m-d', $value);

        return $date !== false && $date->format('Y-m-d') === $value;
    }
}
