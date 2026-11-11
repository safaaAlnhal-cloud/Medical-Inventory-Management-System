<?php

use App\Http\Middleware\EnsureAccountCanUseSystem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
| Every route here is served under the /api prefix (set in bootstrap/app.php), which matches the
| frontend's VITE_API_BASE_URL, e.g. http://localhost:8000/api.
|
| Each module has its own file in routes/api/, owned by one developer, so the two tracks never
| edit the same route file. Add a route to your module's file, not to this one.
|
|   Developer A (inventory and operations)    Developer B (accounts, items and platform)
|   batches.php       /inventory/... batches   auth.php           /auth
|   transactions.php  /transactions            users.php          /users
|   dashboard.php     /dashboard (not alerts)  profile.php        /profile
|   reports.php       /reports/:type           categories.php     /categories
|                                              items.php          /inventory, barcodes, archive
|                                              manufacturers.php  /manufacturers
|                                              notifications.php  /notifications, /dashboard/alerts
|                                              exports.php        /reports/:type/export
|
| Access: every module file is loaded inside the auth:sanctum group below, so its routes need a
| signed-in user by default. Admin-only routes add ->middleware('role:admin').
| Route parameters are numeric ids ({item}, {transaction}...): see AppServiceProvider.
*/

// Public routes (login) and the auth routes, which set their own middleware.
require __DIR__.'/api/auth.php';

// auth:sanctum: a valid token is required (401 without one).
// EnsureAccountCanUseSystem: the token's account must still be active and not expired (401).
Route::middleware(['auth:sanctum', EnsureAccountCanUseSystem::class])->group(function () {

    // Developer A
    require __DIR__.'/api/batches.php';
    require __DIR__.'/api/transactions.php';
    require __DIR__.'/api/dashboard.php';
    require __DIR__.'/api/reports.php';

    // Developer B
    require __DIR__.'/api/users.php';
    require __DIR__.'/api/profile.php';
    require __DIR__.'/api/categories.php';
    require __DIR__.'/api/items.php';
    require __DIR__.'/api/manufacturers.php';
    require __DIR__.'/api/notifications.php';
    require __DIR__.'/api/exports.php';

    // Temporary check route for the Sanctum setup. Removed in phase 6 (GET /auth/me replaces it).
    Route::get('/user', fn (Request $request) => $request->user());
});
