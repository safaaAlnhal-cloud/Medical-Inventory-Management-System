<?php

use App\Http\Controllers\Items\ItemController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 3. BACKEND_HANDOFF.md section 4.4.
// The batch routes under /inventory belong to Developer A, in batches.php.
// Every route here is for any signed-in user: storekeepers manage items too.
//
// GET    /inventory
// GET    /inventory/archived
// GET    /inventory/lookup
// GET    /inventory/by-barcode/{code}
// POST   /inventory
// PUT    /inventory/{item}
// PATCH  /inventory/{item}/archive
// PATCH  /inventory/{item}/restore
// GET    /inventory/{item}/archive-history
// POST   /inventory/{item}/barcodes
// DELETE /inventory/{item}/barcodes/{barcode}

Route::prefix('inventory')->group(function () {
    Route::get('/', [ItemController::class, 'index']);
    Route::get('/archived', [ItemController::class, 'archived']);
    Route::get('/lookup', [ItemController::class, 'lookup']);
    Route::post('/', [ItemController::class, 'store']);
    Route::put('/{item}', [ItemController::class, 'update']);
});
