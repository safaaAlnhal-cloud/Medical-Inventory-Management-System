<?php

use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 2. BACKEND_HANDOFF.md section 4.2.
//
// GET  /users                admin
// GET  /users/directory      any signed-in user
// POST /users                admin
// PUT  /users/{user}         admin
// PUT  /users/{user}/password admin

Route::prefix('users')->group(function () {
    //
});

