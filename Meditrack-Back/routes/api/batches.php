<?php

use App\Http\Controllers\Inventory\BatchOptionController;
use Illuminate\Support\Facades\Route;

// Owner: Developer A. Phases 2-3. BACKEND_HANDOFF.md section 4.4.
// The item routes under /inventory belong to Developer B, in items.php.
//
// GET /inventory/batches/lookup
// GET /inventory/{item}/batch-options?manufacturerId=

Route::prefix('inventory')->group(function () {
    Route::get('/{item}/batch-options', [BatchOptionController::class, 'index']);
});
