<?php

use App\Http\Controllers\Dashboard\DashboardController;
use Illuminate\Support\Facades\Route;

// Owner: Developer A. Phase 5. BACKEND_HANDOFF.md section 4.7.
// /dashboard/alerts belongs to Developer B, in notifications.php.
// /dashboard/critical-inventory is no longer read by either dashboard (they show
// /dashboard/alerts instead); its rows are built with the critical_items report (step 2).
//
// GET /dashboard/summary
// GET /dashboard/stock-movement?months=6     admin
// GET /dashboard/recent-transactions?search=&limit=5

Route::prefix('dashboard')->group(function () {
    Route::get('/summary', [DashboardController::class, 'summary']);
    Route::get('/stock-movement', [DashboardController::class, 'stockMovement'])->middleware('role:admin');
    Route::get('/recent-transactions', [DashboardController::class, 'recentTransactions']);
});
