<?php

namespace App\Reports;

use App\Enums\ReportType;

/**
 * SHARED CONTRACT between GET /reports/{type} (Developer A builds it) and the export
 * (Developer B turns it into a PDF, Excel or CSV file). BACKEND_HANDOFF.md section 4.8.
 *
 * Everything is already in the API's shape: camelCase keys, JSON numbers, ISO dates, no
 * formatted strings. The export reads the same rows and totals, so a file always matches the page.
 *
 *   totals      always covers the whole filtered result, never just one page
 *   breakdown   inventory_value only ([{ categoryId, value }], highest first); [] otherwise
 *   rows        the requested page, or every row when the report was built without a page
 *   pagination  null when built without a page (the export)
 */
final readonly class ReportResult
{
    /**
     * @param  array<string, int|float>  $totals
     * @param  list<array<string, mixed>>  $breakdown
     * @param  list<array<string, mixed>>  $rows
     * @param  array{page: int, pageSize: int, totalItems: int, totalPages: int}|null  $pagination
     */
    public function __construct(
        public ReportType $type,
        public array $totals,
        public array $breakdown,
        public array $rows,
        public ?array $pagination = null,
    ) {}

    /** The response body of GET /reports/{type}. */
    public function toArray(): array
    {
        return [
            'type' => $this->type->value,
            'totals' => $this->totals,
            'breakdown' => $this->breakdown,
            'rows' => $this->rows,
            'pagination' => $this->pagination,
        ];
    }

    /** The number of rows in this result: report_exports.row_count and the file's header. */
    public function rowCount(): int
    {
        return count($this->rows);
    }
}
