<?php

namespace Tests\Feature\Profile;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** GET and PUT /api/profile, PUT /api/profile/password: BACKEND_HANDOFF.md section 4.9. */
class ProfileTest extends TestCase
{
    use RefreshDatabase;

    private User $omar;

    protected function setUp(): void
    {
        parent::setUp();

        User::factory()->admin()->create(['email' => 'sara@medcenter.ps']);
        $this->omar = User::factory()->create([
            'name' => 'Omar Saleh', 'email' => 'omar@medcenter.ps', 'password' => 'secret1',
        ]);
    }

    public function test_the_profile_is_the_signed_in_user(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->getJson('/api/profile')
            ->assertOk()
            ->assertJson(['id' => $this->omar->id, 'email' => 'omar@medcenter.ps', 'role' => 'storekeeper', 'transactionsCount' => 0])
            ->assertJsonMissingPath('password');
    }

    public function test_the_user_updates_their_name_email_and_phone(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->putJson('/api/profile', ['name' => '  Omar S. ', 'email' => 'Omar.S@MedCenter.ps', 'phone' => ' 0599 123 456 '])
            ->assertOk()
            ->assertJson(['name' => 'Omar S.', 'email' => 'omar.s@medcenter.ps', 'phone' => '0599 123 456']);

        $this->putJson('/api/profile', ['name' => 'Omar S.', 'email' => 'omar.s@medcenter.ps', 'phone' => ''])
            ->assertOk()
            ->assertJsonPath('phone', '');
        $this->assertNull($this->omar->fresh()->phone);
    }

    public function test_the_profile_never_changes_role_status_or_expiry(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->putJson('/api/profile', [
            'name' => 'Omar', 'email' => 'omar@medcenter.ps', 'phone' => '',
            'role' => 'admin', 'status' => 'inactive', 'accountExpiresOn' => '2000-01-01',
        ])->assertOk();

        $omar = $this->omar->fresh();
        $this->assertSame('storekeeper', $omar->role->value);
        $this->assertSame('active', $omar->status->value);
        $this->assertNull($omar->account_expires_on);
    }

    public function test_an_email_used_by_another_account_is_a_409_but_keeping_your_own_is_fine(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->putJson('/api/profile', ['name' => 'Omar', 'email' => 'SARA@medcenter.ps'])
            ->assertConflict()
            ->assertJsonPath('errors.email', 'Another account already uses this email address.');

        $this->putJson('/api/profile', ['name' => 'Omar', 'email' => 'OMAR@medcenter.ps'])->assertOk();
    }

    public function test_update_checks_every_field(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->putJson('/api/profile', ['name' => '   ', 'email' => 'nope', 'phone' => str_repeat('1', 31)])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name', 'Full name is required.')
            ->assertJsonPath('errors.email', 'Please enter a valid email address.')
            ->assertJsonPath('errors.phone', 'The phone number may not be longer than 30 characters.');
    }

    public function test_the_password_changes_with_the_right_current_password(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->putJson('/api/profile/password', ['currentPassword' => 'secret1', 'newPassword' => 'another-pass'])
            ->assertNoContent();

        $this->assertTrue(Hash::check('another-pass', $this->omar->fresh()->password));
    }

    public function test_passwords_with_spaces_are_kept_exactly_as_typed(): void
    {
        $this->omar->update(['password' => ' secret1 ']);
        $this->actingAsStorekeeper($this->omar);

        // The current password is compared as typed: without its spaces it is wrong.
        $this->putJson('/api/profile/password', ['currentPassword' => 'secret1', 'newPassword' => 'another-pass'])->assertUnprocessable();
        $this->putJson('/api/profile/password', ['currentPassword' => ' secret1 ', 'newPassword' => '  new pass  '])->assertNoContent();

        $this->assertTrue(Hash::check('  new pass  ', $this->omar->fresh()->password));
    }

    public function test_a_wrong_current_password_or_a_short_new_one_is_a_422(): void
    {
        $this->actingAsStorekeeper($this->omar);

        $this->putJson('/api/profile/password', ['currentPassword' => 'wrong', 'newPassword' => 'another-pass'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.currentPassword', 'Current password is incorrect.');
        $this->putJson('/api/profile/password', ['currentPassword' => 'secret1', 'newPassword' => 'x'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.newPassword', 'The password must be at least 6 characters.');

        $this->assertTrue(Hash::check('secret1', $this->omar->fresh()->password));
    }

    public function test_a_signed_out_request_is_a_401(): void
    {
        $this->getJson('/api/profile')->assertUnauthorized();
    }
}
