<?php

namespace App\Exports\Writers;

use App\Exports\ReportDocument;

/**
 * CSV: the report information as "label,value" lines, a blank line, the table, a blank line, then
 * the totals (BACKEND_HANDOFF.md 4.8, decided). Numbers are written plain (12.5, not $12.50) so a
 * spreadsheet can add them up.
 */
class CsvWriter implements ReportWriter
{
    // Tells Excel the file is UTF-8, so a name with accents or Arabic letters opens correctly.
    private const UTF8_BOM = "\xEF\xBB\xBF";

    public function write(ReportDocument $document): string
    {
        $file = fopen('php://temp', 'r+');

        foreach ($document->info as $label => $value) {
            $this->line($file, [$label, $value]);
        }
        $this->line($file, []);

        $this->line($file, $document->headings);
        foreach ($document->rows as $row) {
            $this->line($file, $row);
        }
        $this->line($file, []);

        $this->line($file, ['Totals']);
        foreach ($document->totals as $label => $value) {
            $this->line($file, [$label, $value]);
        }

        rewind($file);
        $csv = stream_get_contents($file);
        fclose($file);

        return self::UTF8_BOM.$csv;
    }

    public function contentType(): string
    {
        return 'text/csv; charset=UTF-8';
    }

    private function line($file, array $cells): void
    {
        fputcsv($file, array_map(fn ($cell) => $this->cell($cell), $cells), escape: '');
    }

    /**
     * A text cell that starts with = + - @ (or a tab / return) would run as a formula when the file
     * is opened in Excel ("CSV injection"): an item named "=HYPERLINK(...)" must stay text. A leading
     * ' makes Excel show it as typed. Numbers are left alone, so -5 stays a number.
     */
    private function cell(string|int|float|null $cell): string
    {
        if ($cell === null) {
            return '';
        }
        if (is_string($cell) && preg_match('/^[=+\-@\t\r]/', $cell)) {
            return "'".$cell;
        }

        return (string) $cell;
    }
}
