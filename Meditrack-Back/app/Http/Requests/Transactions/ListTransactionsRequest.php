<?php

namespace App\Http\Requests\Transactions;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/** GET /transactions/incoming and /transactions/outgoing: ?search=&itemId=&from=&to= (all optional). */
class ListTransactionsRequest extends FormRequest
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
            'search' => ['nullable', 'string', 'max:150'],
            'itemId' => ['nullable', 'integer'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ];
    }

    public function messages(): array
    {
        return [
            'search.max' => 'The search may not be longer than 150 characters.',
            'itemId.integer' => 'Choose an item from the list.',
            'from.date_format' => 'The start date is not a valid date.',
            'to.date_format' => 'The end date is not a valid date.',
        ];
    }
}
