<?php

namespace App\Enums;

// The file formats a report can be exported in. Every format is built by the backend.
enum ExportFormat: string
{
    case Pdf = 'pdf';
    case Xlsx = 'xlsx';
    case Csv = 'csv';
}
