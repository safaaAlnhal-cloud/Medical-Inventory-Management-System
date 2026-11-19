{{-- The PDF export (PdfWriter, dompdf). {{ }} escapes every value, so a name can never become HTML. --}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $document->title }}</title>
    <style>
        @page { margin: 28px 28px 40px; }
        body { font-family: "DejaVu Sans", sans-serif; font-size: 9px; color: #1e293b; }
        h1 { font-size: 16px; margin: 0 0 10px; }
        table { width: 100%; border-collapse: collapse; }
        .info { width: auto; margin-bottom: 14px; }
        .info th { text-align: left; padding: 2px 14px 2px 0; color: #475569; }
        .info td { padding: 2px 0; }
        .rows th { background: #e2e8f0; text-align: left; padding: 5px 6px; border: 1px solid #cbd5e1; }
        .rows td { padding: 4px 6px; border: 1px solid #e2e8f0; }
        .rows tr:nth-child(even) td { background: #f8fafc; }
        .rows thead { display: table-header-group; }
        .number { text-align: right; }
        .empty { text-align: center; color: #64748b; padding: 12px; }
        h2 { font-size: 11px; margin: 16px 0 6px; }
        .totals { width: auto; }
        .totals th { text-align: left; padding: 2px 18px 2px 0; }
        .totals td { text-align: right; padding: 2px 0; }
    </style>
</head>
<body>
    <h1>{{ $document->title }}</h1>

    <table class="info">
        @foreach ($document->info as $label => $value)
            <tr><th>{{ $label }}</th><td>{{ $value }}</td></tr>
        @endforeach
    </table>

    <table class="rows">
        <thead>
            <tr>
                @foreach ($document->headings as $heading)
                    <th>{{ $heading }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @forelse ($document->rows as $row)
                <tr>
                    @foreach ($row as $column => $value)
                        <td @class(['number' => is_int($value) || is_float($value)])>{{ $cell($value, in_array($column, $document->money, true)) }}</td>
                    @endforeach
                </tr>
            @empty
                <tr><td class="empty" colspan="{{ count($document->headings) }}">No rows match these filters.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Totals</h2>
    <table class="totals">
        @foreach ($document->totals as $label => $value)
            <tr><th>{{ $label }}</th><td>{{ $cell($value, in_array($label, $document->moneyTotals, true)) }}</td></tr>
        @endforeach
    </table>
</body>
</html>
