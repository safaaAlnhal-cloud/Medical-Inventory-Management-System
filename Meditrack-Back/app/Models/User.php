<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'role', 'status', 'phone', 'account_expires_on'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory;

    // The same defaults as the migration, so a model that was just created already has them
    // (otherwise they would be null in memory until the model is reloaded).
    protected $attributes = [
        'role' => 'storekeeper',
        'status' => 'active',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_active_at' => 'datetime',
            'account_expires_on' => 'date',
            'password' => 'hashed',
            'role' => UserRole::class,
            'status' => UserStatus::class,
        ];
    }

    /** Transactions this user recorded (cancelled ones included). */
    public function recordedTransactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'recorded_by');
    }

    public function isAdmin(): bool
    {
        return $this->role === UserRole::Admin;
    }

    public function isActive(): bool
    {
        return $this->status === UserStatus::Active;
    }

    /**
     * account_expires_on is the last day the account works, so it has expired once today
     * (Asia/Gaza) is after that day. The admin account never expires.
     */
    public function isAccountExpired(): bool
    {
        return ! $this->isAdmin()
            && $this->account_expires_on !== null
            && today()->greaterThan($this->account_expires_on);
    }

    /** Active and not expired: may sign in and use a token. */
    public function canUseSystem(): bool
    {
        return $this->isActive() && ! $this->isAccountExpired();
    }
}
