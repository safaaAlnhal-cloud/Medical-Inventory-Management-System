<?php

use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 4. BACKEND_HANDOFF.md sections 4.6 and 4.7 (alerts).
//
// GET   /notifications
// GET   /notifications/unread-count
// PATCH /notifications/{notification}/read
// PATCH /notifications/read-all
// GET   /dashboard/alerts

Route::prefix('notifications')->group(function () {
    //
});

Route::prefix('dashboard')->group(function () {
    // alerts only: the other dashboard routes are Developer A's, in dashboard.php.
});

