<?php

namespace Tests\Feature\Users;

use App\Enums\TransactionStatus;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /api/users?search= and GET /api/users/directory: BACKEND_HANDOFF.md section 4.2. */
class ListUsersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $omar;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->admin()->create(['name' => 'Sara Ahmed', 'email' => 'sara@medcenter.ps']);
        $this->omar = User::factory()->create(['name' => 'Omar Saleh', 'email' => 'omar@medcenter.ps', 'account_expires_on' => '2026-12-31']);
        User::factory()->inactive()->create(['name' => 'Mahmoud Ali', 'email' => 'mahmoud@medcenter.ps']);
    }

    public function test_the_admin_gets_every_user_with_the_user_fields_and_never_the_password(): void
    {
        $this->travelTo('2026-11-12 10:00:00');
        $this->omar->forceFill(['last_active_at' => now()])->save();

        $this->actingAsAdmin($this->admin)
            ->getJson('/api/users')
            ->assertOk()
            ->assertJsonCount(3)
            ->assertJsonPath('1', [
                'id' => $this->omar->id,
                'name' => 'Omar Saleh',
                'email' => 'omar@medcenter.ps',
                'role' => 'storekeeper',
                'status' => 'active',
                'phone' => '',
                'lastActiveAt' => now()->toISOString(),
                'transactionsCount' => 0,
                'accountExpiresOn' => '2026-12-31',
                'accountExpired' => false,
            ])
            ->assertJsonMissingPath('0.password');
    }

    public function test_transactions_count_leaves_out_cancelled_transactions(): void
    {
        $item = Item::factory()->create();
        $this->actingAsStorekeeper($this->omar);
        foreach (['B-1', 'B-2'] as $batch) {
            $this->postJson('/api/transactions/incoming', [
                'itemId' => $item->id, 'batchNumber' => $batch, 'quantity' => 5, 'unitCost' => 1, 'date' => today()->toDateString(),
            ])->assertCreated();
        }
        Transaction::latest('id')->first()->forceFill(['status' => TransactionStatus::Cancelled])->save();

        $this->actingAsAdmin($this->admin)
            ->getJson('/api/users')
            ->assertJsonPath('1.transactionsCount', 1);
    }

    public function test_search_matches_name_email_role_and_status_whatever_the_case(): void
    {
        $this->actingAsAdmin($this->admin);

        $this->getJson('/api/users?search='.urlencode('  OMAR '))->assertJsonCount(1)->assertJsonPath('0.name', 'Omar Saleh');
        $this->getJson('/api/users?search=sara@')->assertJsonCount(1)->assertJsonPath('0.name', 'Sara Ahmed');
        $this->getJson('/api/users?search=admin')->assertJsonCount(1)->assertJsonPath('0.role', 'admin');
        $this->getJson('/api/users?search=inactive')->assertJsonCount(1)->assertJsonPath('0.name', 'Mahmoud Ali');
        $this->getJson('/api/users?search=nobody')->assertExactJson([]);
    }

    public function test_search_expired_finds_the_expired_accounts(): void
    {
        $this->omar->update(['account_expires_on' => today()->subDay()]);

        $this->actingAsAdmin($this->admin)
            ->getJson('/api/users?search=Expired')
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Omar Saleh')
            ->assertJsonPath('0.accountExpired', true);
    }

    public function test_a_storekeeper_cannot_list_users(): void
    {
        $this->actingAsStorekeeper($this->omar)->getJson('/api/users')->assertForbidden();
    }

    public function test_a_search_that_is_not_text_is_a_422(): void
    {
        $this->actingAsAdmin($this->admin)
            ->getJson('/api/users?search[]=x')
            ->assertUnprocessable()
            ->assertJsonPath('errors.search', 'The search must be text.');
    }

    public function test_every_signed_in_user_gets_the_directory_of_ids_and_names(): void
    {
        $this->actingAsStorekeeper($this->omar)
            ->getJson('/api/users/directory')
            ->assertOk()
            ->assertExactJson([
                ['id' => $this->admin->id, 'name' => 'Sara Ahmed'],
                ['id' => $this->omar->id, 'name' => 'Omar Saleh'],
                ['id' => User::where('name', 'Mahmoud Ali')->value('id'), 'name' => 'Mahmoud Ali'],
            ]);
    }

    public function test_a_signed_out_request_is_a_401(): void
    {
        $this->getJson('/api/users')->assertUnauthorized();
        $this->getJson('/api/users/directory')->assertUnauthorized();
    }
}
