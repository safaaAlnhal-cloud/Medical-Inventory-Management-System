<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets the request through only for the given roles; anyone else gets 403 with the standard
 * message. Registered as "role" in bootstrap/app.php:
 *
 *     Route::post('/categories', ...)->middleware('role:admin');
 *
 * It runs after auth:sanctum, so the user is always known here.
 */
class EnsureUserHasRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        abort_unless(in_array($request->user()?->role?->value, $roles, true), 403);

        return $next($request);
    }
}
