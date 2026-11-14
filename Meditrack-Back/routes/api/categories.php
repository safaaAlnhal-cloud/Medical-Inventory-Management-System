<?php

use App\Http\Controllers\Categories\CategoryController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 3. BACKEND_HANDOFF.md section 4.3.
//
// GET    /categories                 any signed-in user
// POST   /categories                 admin
// PUT    /categories/{category}      admin
// DELETE /categories/{category}      admin

Route::prefix('categories')->group(function () {
    Route::get('/', [CategoryController::class, 'index']);

    Route::middleware('role:admin')->group(function () {
        Route::post('/', [CategoryController::class, 'store']);
        Route::put('/{category}', [CategoryController::class, 'update']);
        Route::delete('/{category}', [CategoryController::class, 'destroy']);
    });
});
