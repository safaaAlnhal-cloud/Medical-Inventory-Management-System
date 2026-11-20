<?php

use App\Http\Controllers\Reports\ReportController;
use Illuminate\Support\Facades\Route;

// Owner: Developer A. Phase 5. BACKEND_HANDOFF.md section 4.8.
// The export route (/reports/{type}/export) belongs to Developer B, in exports.php.
// Any signed-in user: both roles may read every report.
//
// GET /reports/{type}?from=&to=&categoryId=&itemId=&search=&page=&pageSize=

Route::prefix('reports')->group(function () {
    Route::get('/{type}', ReportController::class);
});
