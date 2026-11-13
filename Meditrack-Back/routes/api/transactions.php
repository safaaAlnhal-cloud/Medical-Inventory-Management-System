<?php

use App\Http\Controllers\Transactions\DisposalTransactionController;
use App\Http\Controllers\Transactions\IncomingTransactionController;
use App\Http\Controllers\Transactions\OutgoingTransactionController;
use Illuminate\Support\Facades\Route;

// Owner: Developer A. Phases 2-4. BACKEND_HANDOFF.md section 4.5.
//
// GET   /transactions/incoming
// POST  /transactions/incoming
// GET   /transactions/outgoing
// POST  /transactions/outgoing
// POST  /transactions/disposal
// PUT   /transactions/{transaction}
// PATCH /transactions/{transaction}/cancel
// GET   /transactions/{transaction}/batch-options?itemId=
// GET   /transactions/{transaction}/revisions

Route::prefix('transactions')->group(function () {
    Route::get('/incoming', [IncomingTransactionController::class, 'index']);
    Route::post('/incoming', [IncomingTransactionController::class, 'store']);
    Route::get('/outgoing', [OutgoingTransactionController::class, 'index']);
    Route::post('/outgoing', [OutgoingTransactionController::class, 'store']);
    Route::post('/disposal', [DisposalTransactionController::class, 'store']);
});

