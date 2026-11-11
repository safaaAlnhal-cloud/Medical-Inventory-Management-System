<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A token stops working once its account is deactivated or expired: decision 23. */
class AccountCanUseSystemTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_active_account_keeps_using_its_token(): void
    {
        $this->actingAsStorekeeper()->getJson('/api/manufacturers')->assertOk();
    }

    public function test_the_token_of_a_deactivated_account_is_a_401_on_every_route(): void
    {
        $this->actingAsStorekeeper(User::factory()->inactive()->create());

        $this->getJson('/api/manufacturers')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'This account has been deactivated. Please contact an administrator.']);
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_the_token_of_an_expired_account_is_a_401_but_works_on_its_last_day(): void
    {
        $user = User::factory()->create(['account_expires_on' => today()]);
        $this->actingAsStorekeeper($user)->getJson('/api/manufacturers')->assertOk();

        $user->update(['account_expires_on' => today()->subDay()]);

        $this->getJson('/api/manufacturers')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'This account expired on '.today()->subDay()->toDateString().'. Please contact an administrator.');
    }

    public function test_an_expired_admin_date_is_ignored_because_the_admin_never_expires(): void
    {
        $this->actingAsAdmin(User::factory()->admin()->create(['account_expires_on' => today()->subDay()]))
            ->getJson('/api/manufacturers')
            ->assertOk();
    }

    public function test_a_deactivated_user_can_still_sign_out(): void
    {
        $user = User::factory()->inactive()->create();
        $token = $user->createToken('meditrack')->plainTextToken;

        $this->withToken($token)->postJson('/api/auth/logout')->assertNoContent();
        $this->assertSame(0, $user->tokens()->count());
    }
}
