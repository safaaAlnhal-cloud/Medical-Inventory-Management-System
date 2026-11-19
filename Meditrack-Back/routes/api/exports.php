<?php

use App\Http\Controllers\Reports\ReportExportController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 5. BACKEND_HANDOFF.md section 4.8, "Export".
// The report data comes from Developer A's ReportService; this file only turns it into a file.
// Any signed-in user: both roles may read every report.
//
// GET /reports/{type}/export?format=pdf|xlsx|csv&from=&to=&categoryId=&itemId=&search=

Route::prefix('reports')->group(function () {
    Route::get('/{type}/export', ReportExportController::class);
});
