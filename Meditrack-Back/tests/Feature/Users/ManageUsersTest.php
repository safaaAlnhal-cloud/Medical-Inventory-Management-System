<?php

namespace Tests\Feature\Users;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** POST /api/users, PUT /api/users/{user}, PUT /api/users/{user}/password: section 4.2. */
class ManageUsersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $omar;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->admin()->create(['email' => 'sara@medcenter.ps']);
        $this->omar = User::factory()->create(['name' => 'Omar Saleh', 'email' => 'omar@medcenter.ps']);
        $this->actingAsAdmin($this->admin);
    }

    // ---- POST /users ---------------------------------------------------------------------------

    public function test_the_admin_creates_an_active_storekeeper_who_can_then_sign_in(): void
    {
        $this->postJson('/api/users', [
            'name' => '  Ahmad Odeh ', 'email' => 'Ahmad@MedCenter.ps', 'password' => 'secret1',
            'role' => 'storekeeper', 'accountExpiresOn' => today()->addMonth()->toDateString(),
        ])
            ->assertCreated()
            ->assertJson([
                'name' => 'Ahmad Odeh', 'email' => 'ahmad@medcenter.ps', 'role' => 'storekeeper', 'status' => 'active',
                'transactionsCount' => 0, 'accountExpiresOn' => today()->addMonth()->toDateString(), 'accountExpired' => false,
            ])
            ->assertJsonMissingPath('password');

        $this->assertTrue(Hash::check('secret1', User::where('email', 'ahmad@medcenter.ps')->value('password')));
    }

    public function test_an_email_already_in_use_is_a_409_whatever_its_case(): void
    {
        $this->postJson('/api/users', ['name' => 'X', 'email' => 'OMAR@medcenter.ps', 'password' => 'secret1'])
            ->assertConflict()
            ->assertJsonPath('errors.email', 'Another account already uses this email address.');
    }

    public function test_create_checks_every_field(): void
    {
        $this->postJson('/api/users', ['name' => '   ', 'email' => 'nope', 'password' => '123', 'role' => 'admin', 'accountExpiresOn' => '2000-01-01'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name', 'Full name is required.')
            ->assertJsonPath('errors.email', 'Please enter a valid email address.')
            ->assertJsonPath('errors.password', 'The password must be at least 6 characters.')
            ->assertJsonPath('errors.role', 'Only storekeeper accounts can be created.')
            ->assertJsonPath('errors.accountExpiresOn', 'The account expiry date cannot be in the past.');
    }

    // ---- PUT /users/{user} ---------------------------------------------------------------------

    public function test_the_admin_updates_name_email_status_and_expiry_date(): void
    {
        $this->putJson("/api/users/{$this->omar->id}", [
            'name' => 'Omar S.', 'email' => 'omar.s@medcenter.ps', 'status' => 'inactive', 'accountExpiresOn' => today()->toDateString(),
        ])
            ->assertOk()
            ->assertJson(['name' => 'Omar S.', 'email' => 'omar.s@medcenter.ps', 'status' => 'inactive', 'accountExpiresOn' => today()->toDateString()]);
    }

    public function test_the_expiry_date_stays_when_it_is_not_sent_and_null_clears_it(): void
    {
        $this->omar->update(['account_expires_on' => '2030-01-01']);
        $body = ['name' => 'Omar Saleh', 'email' => 'omar@medcenter.ps', 'status' => 'active'];

        $this->putJson("/api/users/{$this->omar->id}", $body)->assertJsonPath('accountExpiresOn', '2030-01-01');
        $this->putJson("/api/users/{$this->omar->id}", [...$body, 'accountExpiresOn' => null])->assertJsonPath('accountExpiresOn', null);
    }

    public function test_a_past_date_is_refused_unless_it_is_the_unchanged_date_of_an_expired_account(): void
    {
        $this->omar->update(['account_expires_on' => '2020-01-01']);
        $body = ['name' => 'Omar Saleh', 'email' => 'omar@medcenter.ps', 'status' => 'active'];

        $this->putJson("/api/users/{$this->omar->id}", [...$body, 'accountExpiresOn' => '2020-01-01'])->assertOk();
        $this->putJson("/api/users/{$this->omar->id}", [...$body, 'accountExpiresOn' => '2021-01-01'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.accountExpiresOn', 'The account expiry date cannot be in the past.');
    }

    public function test_the_admin_account_cannot_get_an_expiry_date(): void
    {
        $this->putJson("/api/users/{$this->admin->id}", [
            'name' => 'Sara', 'email' => 'sara@medcenter.ps', 'status' => 'active', 'accountExpiresOn' => '2030-01-01',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.accountExpiresOn', 'The admin account cannot expire.');
    }

    public function test_the_admin_cannot_deactivate_their_own_account(): void
    {
        $this->putJson("/api/users/{$this->admin->id}", ['name' => 'Sara', 'email' => 'sara@medcenter.ps', 'status' => 'inactive'])
            ->assertConflict()
            ->assertJsonPath('errors.status', 'You cannot deactivate the account you are signed in with.');
    }

    public function test_update_refuses_another_users_email_but_keeps_its_own(): void
    {
        $this->putJson("/api/users/{$this->omar->id}", ['name' => 'Omar', 'email' => 'SARA@medcenter.ps', 'status' => 'active'])
            ->assertConflict()
            ->assertJsonPath('errors.email', 'Another account already uses this email address.');

        $this->putJson("/api/users/{$this->omar->id}", ['name' => 'Omar', 'email' => 'OMAR@medcenter.ps', 'status' => 'active'])->assertOk();
    }

    public function test_an_unknown_status_is_a_422_and_an_unknown_user_is_a_404(): void
    {
        $this->putJson("/api/users/{$this->omar->id}", ['name' => 'Omar', 'email' => 'omar@medcenter.ps', 'status' => 'gone'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.status', 'Please choose a valid account status.');

        $this->putJson('/api/users/999', ['name' => 'X', 'email' => 'x@y.zz', 'status' => 'active'])->assertNotFound();
    }

    // ---- PUT /users/{user}/password ------------------------------------------------------------

    public function test_the_admin_sets_a_new_password(): void
    {
        $this->putJson("/api/users/{$this->omar->id}/password", ['newPassword' => 'brand-new'])->assertNoContent();

        $this->assertTrue(Hash::check('brand-new', $this->omar->fresh()->password));
    }

    public function test_a_new_password_shorter_than_6_characters_is_a_422(): void
    {
        $this->putJson("/api/users/{$this->omar->id}/password", ['newPassword' => '12345'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.newPassword', 'The password must be at least 6 characters.');
    }

    // ---- Access --------------------------------------------------------------------------------

    public function test_a_storekeeper_cannot_create_edit_or_reset_passwords(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->postJson('/api/users', ['name' => 'X', 'email' => 'x@y.zz', 'password' => 'secret1'])->assertForbidden();
        $this->putJson("/api/users/{$this->omar->id}", ['name' => 'X', 'email' => 'x@y.zz', 'status' => 'active'])->assertForbidden();
        $this->putJson("/api/users/{$this->omar->id}/password", ['newPassword' => 'secret1'])->assertForbidden();
    }
}
