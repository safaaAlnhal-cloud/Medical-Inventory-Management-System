<?php

namespace App\Models;

use App\Enums\ExportFormat;
use App\Enums\ReportType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One export file that was produced successfully. Written once, after the file exists.
 */
#[Table(timestamps: false)]
#[Fillable([
    'user_id', 'report_type', 'format', 'filters', 'period_from', 'period_to', 'row_count',
    'exported_at',
])]
class ReportExport extends Model
{
    protected function casts(): array
    {
        return [
            'report_type' => ReportType::class,
            'format' => ExportFormat::class,
            'filters' => 'array',
            'period_from' => 'date',
            'period_to' => 'date',
            'row_count' => 'integer',
            'exported_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
