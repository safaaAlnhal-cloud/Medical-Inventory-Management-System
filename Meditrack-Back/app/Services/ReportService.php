<?php

namespace App\Services;

use App\Enums\ReportType;
use App\Reports\ReportFilters;
use App\Reports\ReportResult;
use LogicException;

/**
 * SHARED CONTRACT. Owner: Developer A (phase 5). Used by Developer B in the export.
 * The signature and the ReportResult shape are agreed: change them only together.
 * BACKEND_HANDOFF.md section 4.8 (filters per report, rows, totals, order).
 */
class ReportService
{
    /**
     * Builds one report.
     *
     * - With $page and $pageSize: that page of rows, and pagination filled in (GET /reports/{type}).
     * - Without them: every row, and pagination null (GET /reports/{type}/export, no row limit).
     *
     * Totals are the same either way. Reports that ignore the period
     * (ReportType::usesPeriod() is false) ignore $filters->from / to.
     */
    public function build(ReportType $type, ReportFilters $filters, ?int $page = null, ?int $pageSize = null): ReportResult
    {
        throw new LogicException('ReportService::build() is not built yet (phase 5, Developer A).');
    }
}
