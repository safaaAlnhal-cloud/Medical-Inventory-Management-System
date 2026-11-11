<?php

use App\Http\Controllers\Manufacturers\ManufacturerController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 2 (ManufacturerService first: Developer A needs it for Incoming).
// BACKEND_HANDOFF.md section 4.4.
//
// GET /manufacturers?search=

Route::prefix('manufacturers')->group(function () {
    Route::get('/', [ManufacturerController::class, 'index']);
});

