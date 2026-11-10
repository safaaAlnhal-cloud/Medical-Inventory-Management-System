<?php

namespace Tests\Feature\Foundation;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserAccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_user_is_an_active_storekeeper_by_default(): void
    {
        $user = User::create(['name' => 'Test', 'email' => 't@example.com', 'password' => 'secret123']);

        $this->assertFalse($user->isAdmin());
        $this->assertTrue($user->isActive());
        $this->assertTrue($user->canUseSystem());
    }

    public function test_account_works_on_its_last_day_and_expires_the_day_after(): void
    {
        $this->travelTo('2026-11-10 10:00');
        $user = User::factory()->create(['account_expires_on' => '2026-11-12']);

        $this->travelTo('2026-11-12 23:59');
        $this->assertTrue($user->canUseSystem(), 'the last day is still a working day');

        $this->travelTo('2026-11-13 00:00');
        $this->assertTrue($user->isAccountExpired());
        $this->assertFalse($user->canUseSystem());
    }

    public function test_the_admin_never_expires(): void
    {
        $this->travelTo('2026-11-10');
        $admin = User::factory()->admin()->create(['account_expires_on' => '2026-01-01']);

        $this->assertFalse($admin->isAccountExpired());
        $this->assertTrue($admin->canUseSystem());
    }

    public function test_an_inactive_user_cannot_use_the_system(): void
    {
        $this->assertFalse(User::factory()->inactive()->create()->canUseSystem());
    }

    public function test_the_password_is_hashed_and_hidden(): void
    {
        $user = User::factory()->create(['password' => 'secret123']);

        $this->assertNotSame('secret123', $user->getRawOriginal('password'));
        $this->assertArrayNotHasKey('password', $user->toArray());
    }
}
