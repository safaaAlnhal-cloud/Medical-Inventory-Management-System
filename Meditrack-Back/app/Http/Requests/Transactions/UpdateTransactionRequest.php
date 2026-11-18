<?php

namespace App\Http\Requests\Transactions;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /transactions/{id}: BACKEND_HANDOFF.md, "Editing transactions". The shape of each field
 * only, for the type the transaction will have after the edit:
 *
 *   both:      type, itemId, quantity, date
 *   incoming:  batchNumber, unitCost, expiryDate, supplier, manufacturer, manufacturingDate
 *   outgoing:  batchId, recipient
 *
 * The other type's fields are ignored if sent (they are not in validated()), and so are the
 * fields that are never editable (id, createdAt, recordedBy, status, an outgoing unitCost...).
 * Everything that depends on stored data is checked by TransactionService::update.
 *
 * expiryDate is not compared with date here: that rule applies only when one of them changes
 * (an old receipt whose batch has expired since can still be corrected), so the service checks it.
 */
class UpdateTransactionRequest extends FormRequest
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
        $common = [
            'type' => ['required', 'in:incoming,outgoing'],
            'itemId' => ['required', 'integer', 'exists:items,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
        ];

        return match ($this->input('type')) {
            'incoming' => [...$common, ...$this->incomingRules()],
            'outgoing' => [...$common,
                'batchId' => ['required', 'integer'],
                'recipient' => ['required', 'string', 'max:150'],
            ],
            default => $common,
        };
    }

    /** As on create (StoreIncomingTransactionRequest), except expiryDate against date. */
    private function incomingRules(): array
    {
        $dateIsValid = $this->isDate('date');
        $expiryIsValid = $this->isDate('expiryDate');

        return [
            'batchNumber' => ['required', 'string', 'max:100'],
            'unitCost' => ['required', 'numeric', 'min:0', 'max:99999999', 'decimal:0,4'],
            'expiryDate' => ['nullable', 'date_format:Y-m-d'],
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
            'type.required' => 'Please choose a valid transaction type.',
            'type.in' => 'Please choose a valid transaction type.',
            'itemId.required' => 'Please choose an item from the inventory.',
            'itemId.integer' => 'Please choose an item from the inventory.',
            'itemId.exists' => 'Please choose an item from the inventory.',
            'quantity.required' => 'Quantity is required.',
            'quantity.integer' => 'Quantity must be a whole number.',
            'quantity.min' => 'Quantity must be greater than zero.',
            'quantity.max' => 'Quantity may not be more than 1,000,000.',
            'date.required' => 'Transaction date is required.',
            'date.date_format' => 'Transaction date is not a valid date.',
            'date.before_or_equal' => 'Transaction date cannot be in the future.',
            'batchNumber.required' => 'Batch number is required.',
            'batchNumber.max' => 'Batch number may not be longer than 100 characters.',
            'unitCost.required' => 'Unit cost is required.',
            'unitCost.numeric' => 'Unit cost must be a number.',
            'unitCost.min' => 'Unit cost must be zero or more.',
            'unitCost.max' => 'Unit cost is too large.',
            'unitCost.decimal' => 'Unit cost may have at most 4 decimal places.',
            'expiryDate.date_format' => 'Expiry date is not a valid date.',
            'supplier.max' => 'Supplier may not be longer than 150 characters.',
            'manufacturer.max' => 'Manufacturer may not be longer than 150 characters.',
            'manufacturingDate.date_format' => 'Manufacturing date is not a valid date.',
            'manufacturingDate.before_or_equal' => 'Manufacturing date cannot be in the future, after the transaction date or after the expiry date.',
            'batchId.required' => 'Please choose a batch.',
            'batchId.integer' => 'Please choose a batch from the list.',
            'recipient.required' => 'Recipient is required.',
            'recipient.max' => 'Recipient may not be longer than 150 characters.',
        ];
    }

    private function isDate(string $field): bool
    {
        $value = $this->input($field);
        if (! is_string($value)) {
            return false;
        }
        $date = \DateTime::createFromFormat('!Y-m-d', $value);

        return $date !== false && $date->format('Y-m-d') === $value;
    }
}
