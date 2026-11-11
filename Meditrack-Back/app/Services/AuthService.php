<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Signing in and out: BACKEND_HANDOFF.md section 4.1, decisions 8 and 23.
 */
class AuthService
{
    // The same message for an unknown email and a wrong password, so a stranger cannot find out
    // which emails have an account.
    public const INVALID_CREDENTIALS = 'Invalid email or password.';

    public const INACTIVE = 'This account is inactive. Please contact an administrator.';

    /**
     * Checks the email and password and issues a new token.
     * The token lasts 30 days with "Remember me" and 24 hours without it.
     *
     * @return array{token: string, user: User}
     */
    public function login(string $email, string $password, bool $remember): array
    {
        $user = User::where('email', Str::lower(trim($email)))->first();

        if ($user === null || ! Hash::check($password, $user->password)) {
            throw new HttpException(401, self::INVALID_CREDENTIALS);
        }

        // Checked only after the password, so only the account's owner learns its state.
        if (! $user->isActive()) {
            throw new AccessDeniedHttpException(self::INACTIVE);
        }
        if ($user->isAccountExpired()) {
            throw new AccessDeniedHttpException(self::expiredMessage($user));
        }

        $expiresAt = $remember ? now()->addDays(30) : now()->addDay();
        $token = $user->createToken('meditrack', ['*'], $expiresAt)->plainTextToken;

        // last_active_at is not fillable (users never send it), so forceFill.
        $user->forceFill(['last_active_at' => now()])->save();

        return ['token' => $token, 'user' => $user];
    }

    /** Revokes the token this request was sent with. Other devices stay signed in. */
    public function logout(User $user): void
    {
        // Only a stored token can be deleted. A test's Sanctum::actingAs() uses a TransientToken,
        // which is not stored, so there is nothing to revoke.
        $token = $user->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }
    }

    public static function expiredMessage(User $user): string
    {
        return 'This account expired on '.$user->account_expires_on->toDateString().'. Please contact an administrator.';
    }
}
