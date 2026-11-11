<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Middleware\EnsureAccountCanUseSystem;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 2. BACKEND_HANDOFF.md section 4.1.
// Unlike the other module files, this one is loaded outside the auth:sanctum group:
// login is public, so me and logout add auth:sanctum themselves.
//
// POST /auth/login           public, rate-limited
// GET  /auth/me              signed in
// POST /auth/logout          signed in

Route::prefix('auth')->group(function () {
    // At most 5 attempts a minute from one address, then 429, so passwords cannot be guessed fast.
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

    // me checks the account like every other signed-in route. logout does not: a deactivated
    // user may still revoke their own token.
    Route::get('/me', [AuthController::class, 'me'])->middleware(['auth:sanctum', EnsureAccountCanUseSystem::class]);
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
});

