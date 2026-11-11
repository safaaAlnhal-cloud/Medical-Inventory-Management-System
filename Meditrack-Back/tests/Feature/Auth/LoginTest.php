<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/** POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout: BACKEND_HANDOFF.md section 4.1. */
class LoginTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(array $attributes = []): User
    {
        return User::factory()->create(['email' => 'omar@medcenter.ps', 'password' => 'store123', ...$attributes]);
    }

    public function test_the_right_email_and_password_return_a_token_and_the_user(): void
    {
        $user = $this->makeUser(['name' => 'Omar Saleh']);

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'store123'])
            ->assertOk()
            ->assertJsonStructure(['token'])
            ->assertJsonPath('user', ['id' => $user->id, 'name' => 'Omar Saleh', 'email' => 'omar@medcenter.ps', 'role' => 'storekeeper']);

        $this->assertNotNull($user->fresh()->last_active_at);
    }

    public function test_the_email_is_matched_whatever_its_case_and_spaces(): void
    {
        $this->makeUser();

        $this->postJson('/api/auth/login', ['email' => '  OMAR@MedCenter.ps ', 'password' => 'store123'])->assertOk();
    }

    public function test_a_wrong_password_and_an_unknown_email_get_the_same_401(): void
    {
        $this->makeUser();

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'wrong'])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Invalid email or password.']);

        $this->postJson('/api/auth/login', ['email' => 'nobody@medcenter.ps', 'password' => 'store123'])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Invalid email or password.']);
    }

    public function test_an_inactive_account_cannot_sign_in(): void
    {
        $this->makeUser(['status' => 'inactive']);

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'store123'])
            ->assertForbidden()
            ->assertJsonPath('message', 'This account is inactive. Please contact an administrator.');
    }

    public function test_an_expired_account_cannot_sign_in_but_works_on_its_last_day(): void
    {
        $user = $this->makeUser(['account_expires_on' => today()->subDay()]);

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'store123'])
            ->assertForbidden()
            ->assertJsonPath('message', 'This account expired on '.today()->subDay()->toDateString().'. Please contact an administrator.');

        $user->update(['account_expires_on' => today()]);

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'store123'])->assertOk();
    }

    public function test_the_token_lasts_24_hours_or_30_days_with_remember_me(): void
    {
        $this->makeUser();
        $this->freezeSecond(); // The database keeps whole seconds.

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'store123'])->assertOk();
        $this->assertEquals(now()->addDay(), PersonalAccessToken::latest('id')->first()->expires_at);

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'store123', 'remember' => true])->assertOk();
        $this->assertEquals(now()->addDays(30), PersonalAccessToken::latest('id')->first()->expires_at);
    }

    public function test_a_request_without_email_or_password_is_a_422(): void
    {
        $this->postJson('/api/auth/login', ['email' => 'omar'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email', 'Enter a valid email address.')
            ->assertJsonPath('errors.password', 'Enter your password.');
    }

    public function test_login_is_limited_to_5_attempts_a_minute(): void
    {
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'wrong'])->assertUnauthorized();
        }

        $this->postJson('/api/auth/login', ['email' => 'omar@medcenter.ps', 'password' => 'wrong'])->assertTooManyRequests()
            ->assertJsonPath('message', 'Too Many Attempts.');
    }

    public function test_me_returns_the_user_the_token_belongs_to(): void
    {
        $user = $this->makeUser();
        $token = $user->createToken('meditrack')->plainTextToken;

        $this->withToken($token)->getJson('/api/auth/me')
            ->assertOk()
            ->assertExactJson(['id' => $user->id, 'name' => $user->name, 'email' => 'omar@medcenter.ps', 'role' => 'storekeeper']);
    }

    public function test_me_without_a_token_is_a_401(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_logout_revokes_only_the_token_it_was_sent_with(): void
    {
        $user = $this->makeUser();
        $token = $user->createToken('meditrack')->plainTextToken;
        $otherDevice = $user->createToken('meditrack')->plainTextToken;

        $this->withToken($token)->postJson('/api/auth/logout')->assertNoContent();

        $this->assertSame(1, $user->tokens()->count());
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->withToken($otherDevice)->getJson('/api/auth/me')->assertOk();
    }
}
