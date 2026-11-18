<?php

namespace Tests\Feature\Notifications;

use App\Enums\OutgoingReason;
use App\Enums\TransactionType;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Notification;
use App\Models\NotificationRead;
use App\Models\Transaction;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NotificationService::syncItem / syncUser / syncAll: which alerts exist and when.
 * BACKEND_HANDOFF.md section 4.6. The endpoints are tested in NotificationsTest.
 */
class NotificationSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Item $item;

    private NotificationService $sync;

    private int $batchCounter = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-18 10:00');
        $this->user = User::factory()->create();
        $this->item = Item::factory()->create(['min_qty' => 10]);
        $this->sync = app(NotificationService::class);
    }

    // ---- Stock alerts ----------------------------------------------------------------------

    public function test_a_new_item_that_never_received_stock_raises_no_alert(): void
    {
        $this->sync->syncItem($this->item);

        $this->assertAlerts([]);
    }

    public function test_low_stock_is_raised_at_min_qty_and_resolved_above_it(): void
    {
        $this->receive(10);
        $this->assertAlerts(["low_stock-{$this->item->id}"]);

        $this->receive(1);
        $this->assertAlerts([]);
    }

    public function test_out_of_stock_replaces_low_stock_as_a_new_alert(): void
    {
        $batch = $this->receive(5);
        $this->assertAlerts(["low_stock-{$this->item->id}"]);

        $this->issue($batch, 5);
        $this->assertAlerts(["out_of_stock-{$this->item->id}"]);
    }

    public function test_expired_stock_does_not_hide_a_shortage(): void
    {
        $this->receive(50, '2026-11-10');   // already expired: none of it is available

        $this->assertAlerts(["out_of_stock-{$this->item->id}", 'expiring-'.$this->lastBatch()->id]);
    }

    // ---- Expiry alerts ---------------------------------------------------------------------

    public function test_each_batch_expiring_within_30_days_raises_one_alert(): void
    {
        $soon = $this->receive(50, '2026-12-18');   // the 30th day: expiring soon
        $this->receive(50, '2026-12-19');           // 31 days: no alert
        $this->receive(50);                         // no expiry date: no alert

        $this->assertAlerts(["expiring-{$soon->id}"]);
    }

    public function test_an_expired_batch_keeps_its_alert_until_it_is_disposed_of(): void
    {
        $this->receive(50);
        $expired = $this->receive(20, '2026-11-17');
        $this->assertAlerts(["expiring-{$expired->id}"]);

        $this->issue($expired, 20, OutgoingReason::ExpiredDisposal);
        $this->assertAlerts([]);
    }

    public function test_a_batch_that_becomes_expiring_soon_overnight_is_picked_up_by_sync_all(): void
    {
        $this->receive(50);
        $batch = $this->receive(50, '2026-12-20');
        $this->assertAlerts([]);

        $this->travelTo('2026-11-20 00:05');
        $this->sync->syncAll();

        $this->assertAlerts(["expiring-{$batch->id}"]);
    }

    // ---- Archive and stored state ----------------------------------------------------------

    public function test_an_archived_item_has_no_alerts_and_they_come_back_on_restore(): void
    {
        $this->receive(5, '2026-11-25');
        $this->assertCount(2, Notification::all());

        $this->item->forceFill(['archived_at' => now()])->save();
        $this->sync->syncItem($this->item);
        $this->assertAlerts([]);

        $this->item->forceFill(['archived_at' => null])->save();
        $this->sync->syncItem($this->item);
        $this->assertCount(2, Notification::all());
    }

    public function test_an_alert_that_stays_keeps_its_id_date_and_read_marks(): void
    {
        $batch = $this->receive(8);
        $alert = Notification::sole();
        NotificationRead::create(['notification_id' => $alert->id, 'user_id' => $this->user->id, 'read_at' => now()]);

        $this->travel(2)->hours();
        $this->issue($batch, 3);   // still low: the same alert

        $this->assertSame($alert->id, Notification::sole()->id);
        $this->assertTrue(Notification::sole()->first_seen_at->equalTo($alert->first_seen_at));
        $this->assertSame(1, NotificationRead::count());
    }

    public function test_a_resolved_alert_is_deleted_with_its_read_marks_and_comes_back_unread(): void
    {
        $batch = $this->receive(8);
        NotificationRead::create(['notification_id' => Notification::sole()->id, 'user_id' => $this->user->id, 'read_at' => now()]);

        $this->receive(50);           // resolved
        $this->assertSame(0, NotificationRead::count());

        $this->travel(1)->hours();
        $this->issue($batch, 8);
        $this->issue($this->lastBatch(), 45);   // low again: a new alert, seen now
        $this->assertTrue(Notification::sole()->first_seen_at->equalTo(now()));
        $this->assertSame(0, NotificationRead::count());
    }

    // ---- Account alerts --------------------------------------------------------------------

    public function test_a_storekeeper_account_warns_from_7_days_before_and_on_its_last_day(): void
    {
        $reem = User::factory()->create(['account_expires_on' => '2026-11-26']);   // 8 days left
        $this->sync->syncUser($reem);
        $this->assertAlerts([]);

        $reem->update(['account_expires_on' => '2026-11-25']);                     // 7 days left
        $this->sync->syncUser($reem);
        $this->assertAlerts(["account_expiring-{$reem->id}"]);

        $reem->update(['account_expires_on' => '2026-11-18']);                     // today is the last day
        $this->sync->syncUser($reem);
        $this->assertAlerts(["account_expires_today-{$reem->id}"]);
    }

    public function test_no_account_alert_once_expired_for_an_inactive_account_or_the_admin(): void
    {
        $reem = User::factory()->create(['account_expires_on' => '2026-11-18']);
        $this->sync->syncUser($reem);
        $this->assertAlerts(["account_expires_today-{$reem->id}"]);

        $this->travelTo('2026-11-19 00:05');
        $this->sync->syncAll();
        $this->assertAlerts([]);

        $inactive = User::factory()->inactive()->create(['account_expires_on' => '2026-11-21']);
        $admin = User::factory()->admin()->create(['account_expires_on' => '2026-11-21']);
        $this->sync->syncUser($inactive);
        $this->sync->syncUser($admin);
        $this->assertAlerts([]);
    }

    public function test_the_last_day_alert_arrives_unread_even_if_the_7_day_one_was_read(): void
    {
        $reem = User::factory()->create(['account_expires_on' => '2026-11-20']);
        $this->sync->syncUser($reem);
        NotificationRead::create(['notification_id' => Notification::sole()->id, 'user_id' => $reem->id, 'read_at' => now()]);

        $this->travelTo('2026-11-20 00:05');
        $this->sync->syncAll();

        $this->assertAlerts(["account_expires_today-{$reem->id}"]);
        $this->assertSame(0, NotificationRead::count());
    }

    // ---- The callers -----------------------------------------------------------------------

    public function test_creating_and_editing_a_user_syncs_its_account_alert(): void
    {
        $this->actingAsAdmin();
        $id = $this->postJson('/api/users', [
            'name' => 'Reem', 'email' => 'reem@medcenter.ps', 'password' => 'secret1', 'accountExpiresOn' => '2026-11-21',
        ])->assertCreated()->json('id');
        $this->assertAlerts(["account_expiring-{$id}"]);

        $this->putJson("/api/users/{$id}", ['name' => 'Reem', 'email' => 'reem@medcenter.ps', 'status' => 'inactive'])
            ->assertOk();
        $this->assertAlerts([]);
    }

    public function test_editing_min_qty_syncs_the_low_stock_alert(): void
    {
        $this->receive(15);
        $this->assertAlerts([]);

        $this->actingAsAdmin()->putJson("/api/inventory/{$this->item->id}", [
            'name' => $this->item->name, 'categoryId' => $this->item->category_id,
            'unit' => $this->item->unit->value, 'minQty' => 20,
        ])->assertOk();

        $this->assertAlerts(["low_stock-{$this->item->id}"]);
    }

    // ---- helpers ---------------------------------------------------------------------------

    /** Records a receipt into a new batch and recalculates, as POST /transactions/incoming does. */
    private function receive(int $quantity, ?string $expiryDate = null): Batch
    {
        $this->travel(1)->minutes();
        $batch = Batch::create([
            'item_id' => $this->item->id, 'batch_number' => 'B-'.++$this->batchCounter,
            'unit_cost' => 1, 'expiry_date' => $expiryDate,
        ]);
        Transaction::create([
            'type' => TransactionType::Incoming, 'item_id' => $this->item->id, 'batch_id' => $batch->id,
            'quantity' => $quantity, 'unit_cost' => 1, 'date' => '2026-11-01', 'recorded_by' => $this->user->id,
        ]);
        app(StockService::class)->recalculate($this->item->fresh());

        return $batch;
    }

    /** Records an issue or a disposal and recalculates. */
    private function issue(Batch $batch, int $quantity, OutgoingReason $reason = OutgoingReason::Issue): void
    {
        $this->travel(1)->minutes();
        Transaction::create([
            'type' => TransactionType::Outgoing, 'reason' => $reason, 'item_id' => $this->item->id,
            'batch_id' => $batch->id, 'quantity' => $quantity, 'unit_cost' => 1,
            'recipient' => $reason === OutgoingReason::Issue ? 'Ward A' : null,
            'date' => '2026-11-15', 'recorded_by' => $this->user->id,
        ]);
        app(StockService::class)->recalculate($this->item->fresh());
    }

    private function lastBatch(): Batch
    {
        return Batch::query()->latest('id')->first();
    }

    /** The stored alert keys, in any order. */
    private function assertAlerts(array $keys): void
    {
        $stored = Notification::query()->pluck('key')->all();
        sort($stored);
        sort($keys);
        $this->assertSame($keys, $stored);
    }
}
