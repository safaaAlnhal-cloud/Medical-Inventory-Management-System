<?php

namespace App\Exports\Writers;

use App\Exports\ReportDocument;
use OpenSpout\Common\Entity\Cell;
use OpenSpout\Common\Entity\Cell\StringCell;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Writer;

/**
 * Excel (.xlsx), with OpenSpout: the same layout as the CSV (the report information, the table, then
 * the totals) on one sheet, with bold labels, a shaded heading row and money formatted as $1,234.50.
 * Numbers stay numbers, so Excel can add them up.
 */
class XlsxWriter implements ReportWriter
{
    private const MONEY = '"$"#,##0.00';

    public function write(ReportDocument $document): string
    {
        // OpenSpout writes to a file, so the file is made in storage/framework/cache (ignored by
        // git) and deleted once it has been read.
        $folder = storage_path('framework/cache');
        $path = tempnam($folder, 'xlsx');

        try {
            $writer = new Writer(new Options(tempFolder: $folder));
            $writer->openToFile($path);
            $sheet = $writer->getCurrentSheet();
            $sheet->setName($document->info['Report'] ?? 'Report');

            $bold = new Style(fontBold: true);
            $money = new Style(format: self::MONEY);

            $writer->addRow(new Row([$this->cell($document->title, new Style(fontBold: true, fontSize: 14))]));
            foreach ($document->info as $label => $value) {
                $writer->addRow(new Row([$this->cell($label, $bold), $this->cell($value)]));
            }
            $writer->addRow(new Row([]));

            $heading = new Style(fontBold: true, backgroundColor: Color::rgb(226, 232, 240));
            $writer->addRow(new Row(array_map(fn (string $title) => $this->cell($title, $heading), $document->headings)));
            foreach ($document->rows as $row) {
                $writer->addRow(new Row(array_map(
                    fn ($value, int $column) => $this->cell($value, in_array($column, $document->money, true) ? $money : null),
                    $row, array_keys($row),
                )));
            }
            $writer->addRow(new Row([]));

            $writer->addRow(new Row([$this->cell('Totals', $bold)]));
            foreach ($document->totals as $label => $value) {
                $style = in_array($label, $document->moneyTotals, true) ? $money : null;
                $writer->addRow(new Row([$this->cell($label, $bold), $this->cell($value, $style)]));
            }

            foreach ($this->widths($document) as $column => $width) {
                $sheet->setColumnWidth($width, $column + 1);
            }
            $writer->close();

            return file_get_contents($path);
        } finally {
            @unlink($path);
        }
    }

    public function contentType(): string
    {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    /**
     * Text is always a text cell: Cell::fromValue() would turn "=HYPERLINK(...)" into a formula
     * that runs when the file is opened, so an item's name can never become one.
     */
    private function cell(string|int|float|null $value, ?Style $style = null): Cell
    {
        return is_string($value) ? new StringCell($value, $style) : Cell::fromValue($value, $style);
    }

    /**
     * A width per column from its longest value, between 10 and 45 characters. The first column
     * also holds the information labels.
     *
     * @return array<int, float>
     */
    private function widths(ReportDocument $document): array
    {
        $lines = [$document->headings, ...$document->rows, ...array_map(fn ($label) => [$label], array_keys($document->info))];
        $widths = [];
        foreach ($lines as $line) {
            foreach (array_values($line) as $column => $value) {
                $widths[$column] = max($widths[$column] ?? 0, mb_strlen((string) $value));
            }
        }

        return array_map(fn (int $length) => (float) min(45, max(10, $length + 2)), $widths);
    }
}
