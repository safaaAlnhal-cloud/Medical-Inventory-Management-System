<?php

namespace App\Exports\Writers;

use App\Exports\ReportDocument;

/** Writes a ReportDocument to one file format. One class per App\Enums\ExportFormat. */
interface ReportWriter
{
    /** The whole file. Throws if it cannot be produced: nothing is logged or sent then. */
    public function write(ReportDocument $document): string;

    /** The Content-Type of the response. */
    public function contentType(): string;
}
