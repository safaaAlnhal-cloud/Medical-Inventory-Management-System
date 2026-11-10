<?php

use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 5. BACKEND_HANDOFF.md section 4.8, "Export".
// The report data comes from Developer A's ReportService; this file only turns it into a file.
//
// GET /reports/{type}/export?format=pdf|xlsx|csv

Route::prefix('reports')->group(function () {
    //
});

