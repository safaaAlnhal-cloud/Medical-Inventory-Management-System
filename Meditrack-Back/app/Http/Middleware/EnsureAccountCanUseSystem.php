<?php

namespace App\Http\Middleware;

use App\Services\AuthService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Runs after auth:sanctum on every signed-in route. A token issued before the account was
 * deactivated or expired stops working at once: 401, so the frontend signs the user out.
 * BACKEND_HANDOFF.md section 4.1, decision 23.
 */
class EnsureAccountCanUseSystem
{
    public const DEACTIVATED = 'This account has been deactivated. Please contact an administrator.';

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user !== null && ! $user->isActive()) {
            throw new HttpException(401, self::DEACTIVATED);
        }
        if ($user !== null && $user->isAccountExpired()) {
            throw new HttpException(401, AuthService::expiredMessage($user));
        }

        return $next($request);
    }
}
