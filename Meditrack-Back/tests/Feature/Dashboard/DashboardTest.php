<?php

namespace Tests\Feature\Dashboard;

use App\Models\Batch;
use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /dashboard/summary, /stock-movement and /recent-transactions: BACKEND_HANDOFF.md 4.7. */
class DashboardTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-19 10:00');
        $this->user = User::factory()->create(['name' => 'Omar Saleh']);
        $this->actingAsStorekeeper($this->user);
    }

    // ---- Summary ----

    public function test_the_summary_counts_active_items_by_status_and_by_expiry(): void
    {
        $available = Item::factory()->create(['min_qty' => 5]);
        $this->receive($available, 20, 5);

        // Low: 3 usable (expiring soon) under its minimum, plus 4 expired that do not count.
        $low = Item::factory()->create(['min_qty' => 5]);
        $this->receive($low, 3, 5, date: '2026-11-01', expiryDate: '2026-12-01');
        $this->receive($low, 4, 5, date: '2026-11-01', expiryDate: '2026-11-18');

        Item::factory()->create();                                   // never received: out of stock
        $archived = Item::factory()->create();
        $archived->forceFill(['archived_at' => now()])->save();      // not counted at all

        $this->getJson('/api/dashboard/summary')->assertOk()->assertExactJson([
            'totalItems' => 3, 'availableCount' => 1, 'lowStockCount' => 1, 'outOfStockCount' => 1,
            'expiringSoonCount' => 1, 'expiredCount' => 1,
        ]);
    }

    public function test_an_empty_or_disposed_batch_no_longer_counts_as_expired(): void
    {
        $item = Item::factory()->create(['min_qty' => 0]);
        $batch = $this->receive($item, 4, 5, date: '2026-11-01', expiryDate: '2026-11-18');
        $this->postJson('/api/transactions/disposal', [
            'itemId' => $item->id, 'batchId' => $batch->id, 'quantity' => 4, 'date' => '2026-11-19',
        ])->assertCreated();

        $this->getJson('/api/dashboard/summary')->assertJsonPath('expiredCount', 0)->assertJsonPath('outOfStockCount', 1);
    }

    // ---- Stock movement ----

    public function test_stock_movement_is_in_money_per_calendar_month_with_disposals_apart(): void
    {
        $this->actingAsAdmin();
        $item = Item::factory()->create();
        $this->travelTo('2026-11-03 10:00');                                                   // before the first batch expires
        $batch = $this->receive($item, 10, 4, date: '2026-09-15', expiryDate: '2026-11-10');   // $40 in September
        $this->receive($item, 5, 10, date: '2026-11-02');                                      // $50 in November; average (10x4 + 5x10) / 15 = 6
        $this->issue($batch, 2, '2026-11-03');                                                 // 2 x $6 = $12 issued
        $this->travelTo('2026-11-19 10:00');                                                   // it has expired since
        $this->postJson('/api/transactions/disposal', [
            'itemId' => $item->id, 'batchId' => $batch->id, 'quantity' => 8, 'date' => '2026-11-19',
        ])->assertCreated();                                                                   // 8 x $6 = $48 disposed

        $this->getJson('/api/dashboard/stock-movement?months=3')->assertOk()->assertExactJson([
            ['month' => '2026-09', 'incoming' => 40, 'outgoing' => 0, 'disposed' => 0],
            ['month' => '2026-10', 'incoming' => 0, 'outgoing' => 0, 'disposed' => 0],
            ['month' => '2026-11', 'incoming' => 50, 'outgoing' => 12, 'disposed' => 48],
        ]);
    }

    public function test_cancelled_transactions_are_left_out_and_archived_items_kept(): void
    {
        $this->actingAsAdmin();
        $item = Item::factory()->create();
        $this->receive($item, 10, 4, date: '2026-11-01');
        $cancelled = $this->receive($item, 5, 9, date: '2026-11-01');
        $this->patchJson('/api/transactions/'.$cancelled->transactions()->value('id').'/cancel')->assertOk();
        $item->forceFill(['archived_at' => now()])->save();

        $this->getJson('/api/dashboard/stock-movement?months=1')
            ->assertExactJson([['month' => '2026-11', 'incoming' => 40, 'outgoing' => 0, 'disposed' => 0]]);
    }

    public function test_six_months_by_default_and_only_for_admins(): void
    {
        $this->getJson('/api/dashboard/stock-movement')->assertForbidden();

        $this->actingAsAdmin();
        $this->getJson('/api/dashboard/stock-movement')
            ->assertOk()
            ->assertJsonCount(6)
            ->assertJsonPath('0.month', '2026-06')
            ->assertJsonPath('5.month', '2026-11');
        $this->getJson('/api/dashboard/stock-movement?months=0')->assertStatus(422)->assertJsonValidationErrors('months');
        $this->getJson('/api/dashboard/stock-movement?months=25')->assertStatus(422);
    }

    // ---- Recent transactions ----

    public function test_recent_transactions_are_the_newest_active_ones_of_both_types(): void
    {
        $item = Item::factory()->create(['name' => 'Paracetamol']);
        $batch = $this->receive($item, 10, 4);
        $issue = $this->issue($batch, 1);
        $cancelled = $this->issue($batch, 1);
        $this->patchJson("/api/transactions/{$cancelled}/cancel")->assertOk();
        $latest = $this->issue($batch, 2);

        $this->getJson('/api/dashboard/recent-transactions')
            ->assertOk()
            ->assertJsonPath('*.id', [$latest, $issue, $batch->transactions()->where('type', 'incoming')->value('id')])
            ->assertJsonPath('0.recipient', 'Ward A')
            ->assertJsonPath('0.revisionsCount', 0);
        $this->getJson('/api/dashboard/recent-transactions?limit=1')->assertJsonCount(1);
    }

    public function test_recent_transactions_search_item_type_recorder_and_batch(): void
    {
        $paracetamol = Item::factory()->create(['name' => 'Paracetamol']);
        $gloves = Item::factory()->create(['name' => 'Gloves']);
        $batch = $this->receive($paracetamol, 10, 4);               // batch R-1
        $this->receive($gloves, 10, 4);
        $issue = $this->issue($batch, 1);

        $this->getJson('/api/dashboard/recent-transactions?search=paraCET')->assertJsonCount(2);
        $this->getJson('/api/dashboard/recent-transactions?search=outgoing')->assertJsonPath('*.id', [$issue]);
        $this->getJson('/api/dashboard/recent-transactions?search=omar')->assertJsonCount(3);
        $this->getJson('/api/dashboard/recent-transactions?search='.$batch->batch_number)->assertJsonCount(2);
        $this->getJson('/api/dashboard/recent-transactions?search=nothing')->assertExactJson([]);
        $this->getJson('/api/dashboard/recent-transactions?limit=51')->assertStatus(422)->assertJsonValidationErrors('limit');
    }

    public function test_a_guest_gets_401(): void
    {
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/dashboard/summary')->assertUnauthorized();
        $this->getJson('/api/dashboard/recent-transactions')->assertUnauthorized();
    }

    private function receive(Item $item, int $quantity, float $unitCost, string $date = '2026-11-01', ?string $expiryDate = '2027-11-01'): Batch
    {
        static $counter = 0;
        $this->travel(1)->seconds();
        $id = $this->postJson('/api/transactions/incoming', [
            'itemId' => $item->id, 'batchNumber' => 'R-'.++$counter, 'quantity' => $quantity,
            'unitCost' => $unitCost, 'date' => $date, 'expiryDate' => $expiryDate,
        ])->assertCreated()->json('batchId');

        return Batch::findOrFail($id);
    }

    /** @return int the outgoing transaction's id */
    private function issue(Batch $batch, int $quantity, string $date = '2026-11-19'): int
    {
        $this->travel(1)->seconds();

        return $this->postJson('/api/transactions/outgoing', [
            'itemId' => $batch->item_id, 'batchId' => $batch->id, 'quantity' => $quantity,
            'recipient' => 'Ward A', 'date' => $date,
        ])->assertCreated()->json('id');
    }
}
