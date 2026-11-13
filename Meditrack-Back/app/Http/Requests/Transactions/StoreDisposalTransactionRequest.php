<?php

namespace App\Http\Requests\Transactions;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /transactions/disposal: BACKEND_HANDOFF.md, "Batch expiry and disposal".
 * The shape of each field only. Whether the batch has expired and how much of it is left
 * depends on stored stock, so TransactionService checks it after the item is locked.
 * There is no recipient (the reason says where the stock went) and no unitCost (the backend
 * takes it from the item's Average Cost).
 */
class StoreDisposalTransactionRequest extends FormRequest
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
            'date.required' => 'Disposal date is required.',
            'date.date_format' => 'Disposal date is not a valid date.',
            'date.before_or_equal' => 'Disposal date cannot be in the future.',
        ];
    }
}
