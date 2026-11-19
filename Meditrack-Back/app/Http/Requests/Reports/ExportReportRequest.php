<?php

namespace App\Http\Requests\Reports;

use App\Enums\ExportFormat;
use App\Reports\ReportFilters;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /reports/{type}/export?format=pdf|xlsx|csv&from=&to=&categoryId=&itemId=&search=
 * The same filters as GET /reports/{type} (BACKEND_HANDOFF.md 4.8), plus the required format.
 */
class ExportReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'format' => ['required', Rule::enum(ExportFormat::class)],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'categoryId' => ['nullable', 'integer', 'exists:categories,id'],
            'itemId' => ['nullable', 'integer', 'exists:items,id'],
            'search' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'format.required' => 'Choose a file format: pdf, xlsx or csv.',
            'format.enum' => 'Choose a file format: pdf, xlsx or csv.',
            'from.date_format' => 'The start date is not a valid date.',
            'to.date_format' => 'The end date is not a valid date.',
            'to.after_or_equal' => 'The end date cannot be before the start date.',
            'categoryId.integer' => 'Choose a category from the list.',
            'categoryId.exists' => 'Choose a category from the list.',
            'itemId.integer' => 'Choose an item from the list.',
            'itemId.exists' => 'Choose an item from the list.',
            'search.string' => 'The search must be text.',
            'search.max' => 'The search may not be longer than 255 characters.',
        ];
    }

    /** Not format(): Laravel's Request already has a format() method of its own. */
    public function exportFormat(): ExportFormat
    {
        return ExportFormat::from($this->validated('format'));
    }

    public function filters(): ReportFilters
    {
        return ReportFilters::fromArray($this->safe()->except('format'));
    }
}
