<?php

namespace App\Exports\Writers;

use App\Exports\ReportDocument;
use Dompdf\Dompdf;
use Dompdf\Options;

/**
 * PDF, with dompdf: resources/views/exports/report.blade.php on A4 landscape (the movement history
 * has nine columns), with "Page x of y" at the bottom. The heading row repeats on every page.
 *
 * Item names are expected in English (BACKEND_HANDOFF.md 4.8): dompdf does not join Arabic letters.
 */
class PdfWriter implements ReportWriter
{
    public function write(ReportDocument $document): string
    {
        $html = $this->html($document);

        $pdf = new Dompdf(new Options([
            'defaultFont' => 'DejaVu Sans',
            // Nothing outside the page itself: no remote images or stylesheets, no PHP in the HTML.
            'isRemoteEnabled' => false,
            'isPhpEnabled' => false,
            'tempDir' => storage_path('framework/cache'),
        ]));
        $pdf->loadHtml($html, 'UTF-8');
        $pdf->setPaper('A4', 'landscape');
        $pdf->render();

        $canvas = $pdf->getCanvas();
        $font = $pdf->getFontMetrics()->getFont('DejaVu Sans');
        $canvas->page_text($canvas->get_width() - 110, $canvas->get_height() - 26, 'Page {PAGE_NUM} of {PAGE_COUNT}', $font, 8, [0.4, 0.45, 0.53]);

        return $pdf->output();
    }

    public function contentType(): string
    {
        return 'application/pdf';
    }

    /** The page dompdf turns into the PDF (public so the tests can read it: the PDF is compressed). */
    public function html(ReportDocument $document): string
    {
        return view('exports.report', [
            'document' => $document,
            'cell' => fn (string|int|float|null $value, bool $money) => $this->cell($value, $money),
        ])->render();
    }

    /** Money as $1,234.50, other numbers with thousands separators, an empty cell as nothing. */
    private function cell(string|int|float|null $value, bool $money): string
    {
        return match (true) {
            $value === null => '',
            $money => '$'.number_format((float) $value, 2),
            is_int($value) => number_format($value),
            is_float($value) => rtrim(rtrim(number_format($value, 2), '0'), '.'),
            default => $value,
        };
    }
}
