<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Exceptions\ConflictException;
use App\Http\Requests\Users\UserRules;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The Users page (admin): BACKEND_HANDOFF.md section 4.2.
 */
class UserService
{
    public function __construct(private readonly NotificationService $notifications) {}

    /**
     * Every user, or only those whose name, email, role or status contains $search (case and
     * surrounding spaces ignored). "expired" also finds the accounts that have expired.
     * Each user carries transactionsCount: the active transactions they recorded.
     */
    public function list(?string $search): Collection
    {
        $search = Str::lower(trim((string) $search));

        return User::query()
            ->withCount(['recordedTransactions as transactions_count' => fn (Builder $query) => $query->active()])            ->when($search !== '', function (Builder $query) use ($search) {
                $query->where(function (Builder $matches) use ($search) {
                    foreach (['name', 'email', 'role', 'status'] as $column) {
                        $matches->orWhere($column, 'like', "%{$search}%");
                    }
                    if (str_contains('expired', $search)) {
                        $matches->orWhere(fn (Builder $expired) => $expired
                            ->where('role', UserRole::Storekeeper)
                            ->whereDate('account_expires_on', '<', today()));
                    }
                });
            })
            ->orderBy('id')
            ->get();
    }

    /**
     * Every user as { id, name }, inactive ones included, so any signed-in user can see who
     * recorded a transaction.
     */
    public function directory(): Collection
    {
        return User::query()->orderBy('id')->get(['id', 'name']);
    }

    /**
     * Creates an active storekeeper. $data: name, email, password, accountExpiresOn (optional).
     * 409 on "email" when another account already uses the address.
     */
    public function create(array $data): User
    {
        $email = Str::lower($data['email']);
        $this->ensureEmailIsFree($email);

        return DB::transaction(function () use ($data, $email) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $email,
                'password' => $data['password'],
                'role' => UserRole::Storekeeper,
                'status' => UserStatus::Active,
                'account_expires_on' => $data['accountExpiresOn'] ?? null,
            ]);
            $this->notifications->syncUser($user);

            return $this->withTransactionsCount($user);
        });
    }

    /**
     * Updates name, email, status and, when it was sent, accountExpiresOn.
     * 409 on "email" (address taken) and on "status" (deactivating the account you are signed in
     * with); 422 on "accountExpiresOn" for a date in the past or any date on the admin account.
     */
    public function update(User $user, array $data, User $actingUser): User
    {
        $email = Str::lower($data['email']);
        $this->ensureEmailIsFree($email, $user);

        $status = UserStatus::from($data['status']);
        if ($status !== UserStatus::Active && $user->is($actingUser)) {
            throw ConflictException::on('status', 'You cannot deactivate the account you are signed in with.');
        }

        $changes = ['name' => $data['name'], 'email' => $email, 'status' => $status];
        if (array_key_exists('accountExpiresOn', $data)) {
            $changes['account_expires_on'] = $this->checkExpiryDate($user, $data['accountExpiresOn']);
        }

        return DB::transaction(function () use ($user, $changes) {
            $user->update($changes);
            if ($user->wasChanged(['status', 'account_expires_on'])) {
                $this->notifications->syncUser($user);
            }

            return $this->withTransactionsCount($user);
        });
    }

    /** The admin sets a new password for an account (there is no "forgot password" by email). */
    public function resetPassword(User $user, string $newPassword): void
    {
        $user->update(['password' => $newPassword]);
    }

    private function ensureEmailIsFree(string $email, ?User $except = null): void
    {
        $taken = User::query()
            ->whereRaw('LOWER(email) = ?', [$email])
            ->when($except !== null, fn (Builder $query) => $query->whereKeyNot($except->id))
            ->exists();

        if ($taken) {
            throw ConflictException::on('email', 'Another account already uses this email address.');
        }
    }

    /**
     * The admin never expires, so no date may be set on that account. A past date is refused,
     * unless it is the date the account already has (the form sends it back unchanged).
     */
    private function checkExpiryDate(User $user, ?string $date): ?string
    {
        if ($date === null) {
            return null;
        }
        if ($user->isAdmin()) {
            throw ValidationException::withMessages(['accountExpiresOn' => 'The admin account cannot expire.']);
        }
        $unchanged = $date === $user->account_expires_on?->toDateString();
        if (! $unchanged && $date < today()->toDateString()) {
            throw ValidationException::withMessages(['accountExpiresOn' => UserRules::PAST_DATE]);
        }

        return $date;
    }

    private function withTransactionsCount(User $user): User
    {
        return $user->loadCount(['recordedTransactions as transactions_count' => fn (Builder $query) => $query->active()]);
    }
}
