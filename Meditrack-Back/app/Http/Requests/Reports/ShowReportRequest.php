<?php

namespace App\Http\Requests\Reports;

use App\Reports\ReportFilters;
use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /reports/{type}?from=&to=&categoryId=&itemId=&search=&page=&pageSize=
 * The same filters and messages as the export (ExportReportRequest), plus the page.
 * Any signed-in user: both roles may read every report (BACKEND_HANDOFF.md 4.8).
 */
class ShowReportRequest extends FormRequest
{
    public const DEFAULT_PAGE_SIZE = 10;

    // The mock mode's print-dialog PDF asks for one page of up to 1000 rows.
    public const MAX_PAGE_SIZE = 1000;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'categoryId' => ['nullable', 'integer', 'exists:categories,id'],
            'itemId' => ['nullable', 'integer', 'exists:items,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PAGE_SIZE],
        ];
    }

    public function messages(): array
    {
        return [
            ...(new ExportReportRequest)->messages(),
            'page.*' => 'The page must be a whole number of 1 or more.',
            'pageSize.*' => 'The page size must be a whole number from 1 to '.self::MAX_PAGE_SIZE.'.',
        ];
    }

    public function filters(): ReportFilters
    {
        return ReportFilters::fromArray($this->safe()->except(['page', 'pageSize']));
    }

    public function page(): int
    {
        return (int) ($this->validated('page') ?? 1);
    }

    public function pageSize(): int
    {
        return (int) ($this->validated('pageSize') ?? self::DEFAULT_PAGE_SIZE);
    }
}
