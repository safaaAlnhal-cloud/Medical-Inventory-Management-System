<?php

use App\Http\Controllers\Users\UserController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 2. BACKEND_HANDOFF.md section 4.2.
//
// GET  /users                admin
// GET  /users/directory      any signed-in user
// POST /users                admin
// PUT  /users/{user}         admin
// PUT  /users/{user}/password admin

Route::prefix('users')->group(function () {
    Route::get('/', [UserController::class, 'index'])->middleware('role:admin');
    Route::get('/directory', [UserController::class, 'directory']);

    Route::middleware('role:admin')->group(function () {
        Route::post('/', [UserController::class, 'store']);
        Route::put('/{user}', [UserController::class, 'update']);
        Route::put('/{user}/password', [UserController::class, 'resetPassword']);
    });
});

