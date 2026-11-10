<?php

use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 3. BACKEND_HANDOFF.md section 4.4.
// The batch routes under /inventory belong to Developer A, in batches.php.
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
    //
});

