<?php

namespace App\Http\Requests\Transactions;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /transactions/outgoing: BACKEND_HANDOFF.md section 4.5, "Validation on create".
 * The shape of each field only. Whether the batch can give that much on that date depends on
 * stored stock, so TransactionService checks it after the item is locked.
 * There is no unitCost: the backend takes it from the item's Average Cost.
 */
class StoreOutgoingTransactionRequest extends FormRequest
{
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
            'itemId' => ['required', 'integer', 'exists:items,id'],
            'batchId' => ['required', 'integer'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'recipient' => ['required', 'string', 'max:150'],
        ];
    }

    public function messages(): array
    {
        return [
            'itemId.required' => 'Please choose an item from the inventory.',
            'itemId.integer' => 'Please choose an item from the inventory.',
            'itemId.exists' => 'Please choose an item from the inventory.',
            'batchId.required' => 'Please choose a batch.',
            'batchId.integer' => 'Please choose a batch from the list.',
            'quantity.required' => 'Quantity is required.',
            'quantity.integer' => 'Quantity must be a whole number.',
            'quantity.min' => 'Quantity must be greater than zero.',
            'quantity.max' => 'Quantity may not be more than 1,000,000.',
            'date.required' => 'Transaction date is required.',
            'date.date_format' => 'Transaction date is not a valid date.',
            'date.before_or_equal' => 'Transaction date cannot be in the future.',
            'recipient.required' => 'Recipient is required.',
            'recipient.max' => 'Recipient may not be longer than 150 characters.',
        ];
    }
}
