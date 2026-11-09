<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * The single admin account (decided: one admin, created here; the app cannot create another).
 * Same credentials as the frontend mock (src/mockData/usersMock.js), so both modes sign in alike.
 * Change the password from the Profile page after the first sign-in.
 */
class AdminSeeder extends Seeder
{
    public function run(): void
    {
        // updateOrCreate: running the seeder again never creates a second admin.
        User::updateOrCreate(
            ['email' => 'sara@medcenter.ps'],
            [
                'name' => 'Sara Ahmed',
                'password' => 'admin123',
                'role' => UserRole::Admin,
                'status' => UserStatus::Active,
            ],
        );
    }
}
