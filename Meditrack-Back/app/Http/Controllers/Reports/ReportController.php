<?php

namespace App\Http\Controllers\Reports;

use App\Enums\ReportType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\ShowReportRequest;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;

/** GET /reports/{type}: one page of a report. The export is ReportExportController (Developer B). */
class ReportController extends Controller
{
    public function __construct(private readonly ReportService $reports) {}

    // {type} is the ReportType enum: an unknown type is a 404 before this runs.
    public function __invoke(ShowReportRequest $request, ReportType $type): JsonResponse
    {
        $report = $this->reports->build($type, $request->filters(), $request->page(), $request->pageSize());

        return response()->json($report->toArray());
    }
}
