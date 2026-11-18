<?php

use App\Http\Controllers\Notifications\NotificationController;
use Illuminate\Support\Facades\Route;

// Owner: Developer B. Phase 4. BACKEND_HANDOFF.md sections 4.6 and 4.7 (alerts).
// Every route is for any signed-in user; each one only shows that user's own alerts.
//
// GET   /notifications?search=
// GET   /notifications/unread-count
// PATCH /notifications/{key}/read
// PATCH /notifications/read-all
// GET   /dashboard/alerts?search=&limit=

Route::prefix('notifications')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
    Route::patch('/read-all', [NotificationController::class, 'markAllRead']);
    // An alert's id is its key ("low_stock-4"), not a number, so this is {key} and not
    // {notification} (which AppServiceProvider limits to numbers).
    Route::patch('/{key}/read', [NotificationController::class, 'markRead'])->where('key', '[a-z_]+-[0-9]+');
});

Route::prefix('dashboard')->group(function () {
    // alerts only: the other dashboard routes are Developer A's, in dashboard.php.
    Route::get('/alerts', [NotificationController::class, 'dashboardAlerts']);
});
