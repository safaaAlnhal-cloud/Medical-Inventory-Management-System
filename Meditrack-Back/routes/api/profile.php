<?php

use App\Http\Controllers\Profile\ProfileController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 3. BACKEND_HANDOFF.md section 4.9.
// Any signed-in user, always acting on the account of the token (never on an id from the page).
//
// GET /profile
// PUT /profile
// PUT /profile/password

Route::prefix('profile')->group(function () {
    Route::get('/', [ProfileController::class, 'show']);
    Route::put('/', [ProfileController::class, 'update']);
    Route::put('/password', [ProfileController::class, 'changePassword']);
});
