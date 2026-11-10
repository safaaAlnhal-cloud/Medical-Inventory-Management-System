<?php

use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 2. BACKEND_HANDOFF.md section 4.1.
// Unlike the other module files, this one is loaded outside the auth:sanctum group:
// login is public, so me and logout add auth:sanctum themselves.
//
// POST /auth/login           public, rate-limited
// GET  /auth/me              signed in
// POST /auth/logout          signed in

Route::prefix('auth')->group(function () {
    //
});

