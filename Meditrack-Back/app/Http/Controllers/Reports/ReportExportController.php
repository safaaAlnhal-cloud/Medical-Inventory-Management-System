<?php

namespace App\Http\Controllers\Reports;

use App\Enums\ReportType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\ExportReportRequest;
use App\Services\ReportExportService;
use Illuminate\Http\Response;

/** GET /reports/{type}/export: BACKEND_HANDOFF.md 4.8, "Export". */
class ReportExportController extends Controller
{
    public function __construct(private readonly ReportExportService $exports) {}

    /** The file as a download. An unknown {type} is 404 (enum route binding). */
    public function __invoke(ExportReportRequest $request, ReportType $type): Response
    {
        $file = $this->exports->export($type, $request->filters(), $request->exportFormat(), $request->user());

        return response($file->content, 200, [
            'Content-Type' => $file->contentType,
            'Content-Disposition' => "attachment; filename=\"{$file->filename}\"",
        ]);
    }
}
