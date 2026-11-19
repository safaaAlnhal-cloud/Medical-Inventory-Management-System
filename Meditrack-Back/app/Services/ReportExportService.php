<?php

namespace App\Services;

use App\Enums\ExportFormat;
use App\Enums\ReportType;
use App\Exports\ExportedFile;
use App\Exports\ReportDocumentBuilder;
use App\Exports\Writers\CsvWriter;
use App\Exports\Writers\PdfWriter;
use App\Exports\Writers\ReportWriter;
use App\Exports\Writers\XlsxWriter;
use App\Models\ReportExport;
use App\Models\User;
use App\Reports\ReportFilters;

/**
 * GET /reports/{type}/export: BACKEND_HANDOFF.md 4.8, "Export". Owner: Developer B (phase 5).
 *
 * The report itself comes from Developer A's ReportService, built without a page so it holds
 * every row: the file always matches the Reports page, with no row limit.
 */
class ReportExportService
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly ReportDocumentBuilder $documents,
    ) {}

    /**
     * Builds the file completely, and only then records it in report_exports: a failed export
     * throws before the log is written, so it records nothing.
     */
    public function export(ReportType $type, ReportFilters $filters, ExportFormat $format, User $user): ExportedFile
    {
        $writer = $this->writer($format);
        $report = $this->reports->build($type, $filters);
        $content = $writer->write($this->documents->build($report, $filters, $user));

        ReportExport::create([
            'user_id' => $user->id,
            'report_type' => $type,
            'format' => $format,
            'filters' => $filters->toArray(),
            // The period only means something for the reports that use it.
            'period_from' => $type->usesPeriod() ? $filters->from : null,
            'period_to' => $type->usesPeriod() ? $filters->to : null,
            'row_count' => $report->rowCount(),
            'exported_at' => now(),
        ]);

        return new ExportedFile(
            content: $content,
            contentType: $writer->contentType(),
            filename: "meditrack-{$type->value}-".today()->toDateString().".{$format->value}",
        );
    }

    private function writer(ExportFormat $format): ReportWriter
    {
        return match ($format) {
            ExportFormat::Pdf => new PdfWriter,
            ExportFormat::Xlsx => new XlsxWriter,
            ExportFormat::Csv => new CsvWriter,
        };
    }
}
