<?php

namespace App\Services;

use App\Http\Requests\Users\UserRules;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The Profile page (storekeeper) and the Settings page (admin): BACKEND_HANDOFF.md section 4.9.
 * Every method acts on the signed-in user, whom the controller takes from the token.
 */
class ProfileService
{
    public function __construct(private readonly UserService $users) {}

    /** The signed-in user, with transactionsCount like every other User. */
    public function show(User $user): User
    {
        return $this->users->withTransactionsCount($user);
    }

    /**
     * Updates name, email and phone. 409 on "email" when another account already uses it.
     * Role, status and the expiry date are never changed here: only an admin changes them,
     * on the Users page.
     */
    public function update(User $user, array $data): User
    {
        $email = Str::lower($data['email']);
        $this->users->ensureEmailIsFree($email, $user);

        $user->update([
            'name' => $data['name'],
            'email' => $email,
            'phone' => $data['phone'] ?? null,
        ]);

        return $this->users->withTransactionsCount($user);
    }

    /** 422 on "currentPassword" when it is not the account's password. */
    public function changePassword(User $user, string $currentPassword, string $newPassword): void
    {
        if (! Hash::check($currentPassword, $user->password)) {
            throw ValidationException::withMessages(['currentPassword' => UserRules::WRONG_PASSWORD]);
        }

        $user->update(['password' => $newPassword]);
    }
}
