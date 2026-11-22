<?php

namespace Tests\Feature\Notifications;

use App\Enums\OutgoingReason;
use App\Enums\TransactionType;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /notifications, /notifications/unread-count, PATCH /notifications/{key}/read and
 * /read-all, GET /dashboard/alerts: BACKEND_HANDOFF.md sections 4.6 and 4.7.
 */
class NotificationsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $omar;

    private int $batchCounter = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-18 10:00');
        $this->admin = User::factory()->admin()->create(['name' => 'Sara']);
        $this->omar = User::factory()->create(['name' => 'Omar']);
    }

    public function test_a_low_stock_alert_has_the_notification_shape(): void
    {
        $gloves = Item::factory()->create(['name' => 'Gloves', 'min_qty' => 10]);
        $this->receive($gloves, 8);

        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications')
            ->assertOk()
            ->assertExactJson([[
                'id' => "low_stock-{$gloves->id}", 'type' => 'low_stock', 'itemId' => $gloves->id, 'batchId' => null,
                'quantity' => 8, 'minQty' => 10, 'expiryDate' => null, 'expiryStatus' => null,
                'userId' => null, 'accountExpiresOn' => null, 'daysLeft' => null,
                'createdAt' => now()->toISOString(), 'read' => false,
            ]]);
    }

    public function test_an_expiring_alert_carries_the_batch_and_an_account_alert_the_days_left(): void
    {
        $saline = Item::factory()->create(['min_qty' => 5]);
        $this->receive($saline, 50);
        $batch = $this->receive($saline, 20, '2026-11-17');
        $reem = $this->storekeeperExpiringOn('2026-11-23');

        $alerts = collect($this->actingAsAdmin($this->admin)->getJson('/api/notifications')->assertOk()->json())->keyBy('id');

        $this->assertSame(
            ['type' => 'expiring', 'itemId' => $saline->id, 'batchId' => $batch->id, 'quantity' => 20, 'minQty' => null,
                'expiryDate' => '2026-11-17', 'expiryStatus' => 'expired', 'userId' => null],
            collect($alerts["expiring-{$batch->id}"])->only(['type', 'itemId', 'batchId', 'quantity', 'minQty', 'expiryDate', 'expiryStatus', 'userId'])->all(),
        );
        $this->assertSame(
            ['type' => 'account_expiring', 'itemId' => null, 'quantity' => null, 'userId' => $reem->id, 'accountExpiresOn' => '2026-11-23', 'daysLeft' => 5],
            collect($alerts["account_expiring-{$reem->id}"])->only(['type', 'itemId', 'quantity', 'userId', 'accountExpiresOn', 'daysLeft'])->all(),
        );
    }

    public function test_alerts_come_in_priority_order(): void
    {
        $low = Item::factory()->create(['min_qty' => 10]);
        $this->receive($low, 5);                                  // low_stock
        $out = Item::factory()->create(['min_qty' => 10]);
        $this->issue($this->receive($out, 5), 5);                 // out_of_stock
        $expiring = Item::factory()->create(['min_qty' => 1]);
        $soonLater = $this->receive($expiring, 50, '2026-12-10');  // expiring soon
        $soonFirst = $this->receive($expiring, 50, '2026-11-25');  // expiring soon, nearer
        $expiredRecent = $this->receive($expiring, 5, '2026-11-17');
        $expiredOld = $this->receive($expiring, 5, '2026-11-01');
        $lastDay = $this->storekeeperExpiringOn('2026-11-18');
        $inThree = $this->storekeeperExpiringOn('2026-11-21');
        $inTwo = $this->storekeeperExpiringOn('2026-11-20');

        $this->actingAsAdmin($this->admin)->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('*.id', [
                "expiring-{$expiredOld->id}", "expiring-{$expiredRecent->id}",
                "expiring-{$soonFirst->id}", "expiring-{$soonLater->id}",
                "out_of_stock-{$out->id}",
                "low_stock-{$low->id}",
                "account_expires_today-{$lastDay->id}", "account_expiring-{$inTwo->id}", "account_expiring-{$inThree->id}",
            ]);
    }

    public function test_equal_stock_alerts_are_newest_first(): void
    {
        $first = Item::factory()->create(['min_qty' => 10]);
        $this->receive($first, 5);
        $this->travel(1)->hours();
        $second = Item::factory()->create(['min_qty' => 10]);
        $this->receive($second, 5);

        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications')
            ->assertJsonPath('*.id', ["low_stock-{$second->id}", "low_stock-{$first->id}"]);
    }

    public function test_account_alerts_are_seen_by_the_admin_and_the_account_holder_only(): void
    {
        $reem = $this->storekeeperExpiringOn('2026-11-20');
        $key = "account_expiring-{$reem->id}";

        $this->actingAsAdmin($this->admin)->getJson('/api/notifications')->assertJsonPath('*.id', [$key]);
        $this->actingAsStorekeeper($reem)->getJson('/api/notifications')->assertJsonPath('*.id', [$key]);
        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications')->assertExactJson([]);
        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications/unread-count')->assertExactJson(['count' => 0]);
        $this->actingAsStorekeeper($this->omar)->getJson('/api/dashboard/alerts')->assertExactJson([]);
        $this->actingAsStorekeeper($this->omar)->patchJson("/api/notifications/{$key}/read")->assertNotFound();
    }

    public function test_read_state_is_per_user(): void
    {
        $item = Item::factory()->create(['min_qty' => 10]);
        $this->receive($item, 5);
        $key = "low_stock-{$item->id}";

        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications/unread-count')->assertExactJson(['count' => 1]);
        $this->actingAsStorekeeper($this->omar)->patchJson("/api/notifications/{$key}/read")
            ->assertOk()
            ->assertJson(['id' => $key, 'read' => true]);

        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications/unread-count')->assertExactJson(['count' => 0]);
        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications')->assertJsonPath('0.read', true);
        $this->actingAsAdmin($this->admin)->getJson('/api/notifications/unread-count')->assertExactJson(['count' => 1]);
        $this->actingAsAdmin($this->admin)->getJson('/api/notifications')->assertJsonPath('0.read', false);

        // Reading it again changes nothing.
        $this->actingAsStorekeeper($this->omar)->patchJson("/api/notifications/{$key}/read")->assertOk();
        $this->assertDatabaseCount('notification_reads', 1);
    }

    public function test_read_all_marks_only_the_alerts_the_user_can_see(): void
    {
        $item = Item::factory()->create(['min_qty' => 10]);
        $this->receive($item, 5, '2026-11-30');
        $this->storekeeperExpiringOn('2026-11-20');

        $this->actingAsStorekeeper($this->omar)->patchJson('/api/notifications/read-all')->assertNoContent();

        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications/unread-count')->assertExactJson(['count' => 0]);
        $this->assertDatabaseCount('notification_reads', 2);   // the two stock alerts, not Reem's
        $this->actingAsAdmin($this->admin)->getJson('/api/notifications/unread-count')->assertExactJson(['count' => 3]);
    }

    public function test_a_resolved_alert_returns_404_when_marked_as_read(): void
    {
        $item = Item::factory()->create(['min_qty' => 10]);
        $this->receive($item, 5);
        $this->receive($item, 50);   // resolved

        $this->actingAsStorekeeper($this->omar)->patchJson("/api/notifications/low_stock-{$item->id}/read")->assertNotFound();
        $this->actingAsStorekeeper($this->omar)->patchJson('/api/notifications/not-a-key/read')->assertNotFound();
    }

    public function test_search_matches_item_type_batch_and_account_holder(): void
    {
        $gloves = Item::factory()->create(['name' => 'Latex Gloves', 'min_qty' => 10]);
        $this->receive($gloves, 5);
        $saline = Item::factory()->create(['name' => 'Saline', 'min_qty' => 1]);
        $batch = $this->receive($saline, 50, '2026-11-30');
        $reem = $this->storekeeperExpiringOn('2026-11-20', 'Reem Haddad');

        $ids = fn (string $search) => $this->actingAsAdmin($this->admin)
            ->getJson('/api/notifications?search='.urlencode($search))->assertOk()->json('*.id');

        $this->assertSame(["low_stock-{$gloves->id}"], $ids('  GLOVES '));
        $this->assertSame(["low_stock-{$gloves->id}"], $ids('low stock'));
        $this->assertSame(["expiring-{$batch->id}"], $ids($batch->batch_number));
        $this->assertSame(["account_expiring-{$reem->id}"], $ids('reem'));
        $this->assertSame(["account_expiring-{$reem->id}"], $ids('account'));
        $this->assertSame([], $ids('nothing like this'));
    }

    public function test_dashboard_alerts_are_the_first_alerts_of_the_same_list(): void
    {
        foreach (range(1, 4) as $n) {
            $this->receive(Item::factory()->create(['min_qty' => 10]), 5);
            $this->travel(1)->minutes();
        }
        $all = $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications')->json('*.id');

        $this->actingAsStorekeeper($this->omar)->getJson('/api/dashboard/alerts')->assertJsonPath('*.id', array_slice($all, 0, 3));
        $this->actingAsStorekeeper($this->omar)->getJson('/api/dashboard/alerts?limit=2')->assertJsonPath('*.id', array_slice($all, 0, 2));
        $this->actingAsStorekeeper($this->omar)->getJson('/api/dashboard/alerts?limit=0')
            ->assertUnprocessable()
            ->assertJsonPath('errors.limit', 'The limit must be a whole number from 1 to 50.');
    }

    public function test_the_first_read_of_a_new_day_picks_up_alerts_that_came_with_the_date(): void
    {
        $item = Item::factory()->create(['min_qty' => 1]);
        $batch = $this->receive($item, 50, '2026-12-20');
        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications')->assertExactJson([]);

        $this->travelTo('2026-11-21 08:00');   // the scheduler did not run overnight

        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications/unread-count')->assertExactJson(['count' => 1]);
        $this->actingAsStorekeeper($this->omar)->getJson('/api/notifications')->assertJsonPath('*.id', ["expiring-{$batch->id}"]);
    }

    public function test_every_route_needs_a_signed_in_user(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
        $this->getJson('/api/notifications/unread-count')->assertUnauthorized();
        $this->patchJson('/api/notifications/low_stock-1/read')->assertUnauthorized();
        $this->patchJson('/api/notifications/read-all')->assertUnauthorized();
        $this->getJson('/api/dashboard/alerts')->assertUnauthorized();
    }

    // ---- helpers ---------------------------------------------------------------------------

    private function receive(Item $item, int $quantity, ?string $expiryDate = null): Batch
    {
        $this->travel(1)->seconds();
        $batch = Batch::create([
            'item_id' => $item->id, 'batch_number' => 'LOT-'.++$this->batchCounter,
            'unit_cost' => 1, 'expiry_date' => $expiryDate,
        ]);
        Transaction::create([
            'type' => TransactionType::Incoming, 'item_id' => $item->id, 'batch_id' => $batch->id,
            'quantity' => $quantity, 'unit_cost' => 1, 'date' => '2026-11-01', 'recorded_by' => $this->omar->id,
        ]);
        app(StockService::class)->recalculate($item->fresh());

        return $batch;
    }

    private function issue(Batch $batch, int $quantity): void
    {
        $this->travel(1)->seconds();
        Transaction::create([
            'type' => TransactionType::Outgoing, 'reason' => OutgoingReason::Issue, 'item_id' => $batch->item_id,
            'batch_id' => $batch->id, 'quantity' => $quantity, 'unit_cost' => 1, 'recipient' => 'Ward A',
            'date' => '2026-11-15', 'recorded_by' => $this->omar->id,
        ]);
        app(StockService::class)->recalculate($batch->item->fresh());
    }

    private function storekeeperExpiringOn(string $date, string $name = 'Reem'): User
    {
        $user = User::factory()->create(['name' => $name, 'account_expires_on' => $date]);
        app(NotificationService::class)->syncUser($user);

        return $user;
    }
}
