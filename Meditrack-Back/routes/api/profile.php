<?php

use App\Http\Controllers\Profile\ProfileController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 3. BACKEND_HANDOFF.md section 4.9.
// Always acting on the account of the token (never on an id from the page).
//
// GET /profile             any signed-in user
// PUT /profile             admin only (Settings page): a storekeeper does not change their own details (decision 12)
// PUT /profile/password    any signed-in user

Route::prefix('profile')->group(function () {
    Route::get('/', [ProfileController::class, 'show']);
    Route::put('/', [ProfileController::class, 'update'])->middleware('role:admin');
    Route::put('/password', [ProfileController::class, 'changePassword']);
});
