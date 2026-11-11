<?php

namespace Tests\Feature\Stock;

use App\Enums\OutgoingReason;
use App\Enums\TransactionStatus;
use App\Enums\TransactionType;
use App\Exceptions\ConflictException;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The worked examples of BACKEND_HANDOFF.md ("Average Cost and Unit Cost", "Cancelled
 * transactions", "Editing transactions"). The transactions are written straight to the database,
 * as the actions will, and StockService rebuilds the figures from them.
 */
class StockServiceTest extends TestCase
{
    use RefreshDatabase;

    private StockService $stock;

    private Item $item;

    private User $user;

    private int $batchCounter = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-11 09:00');
        $this->stock = app(StockService::class);
        $this->item = Item::factory()->create();
        $this->user = User::factory()->create();
    }

    public function test_the_average_is_weighted_by_quantity_and_issues_do_not_change_it(): void
    {
        $this->receive(10, 5);
        $this->assertFigures(10, '5.0000');

        $this->receive(20, 8);
        $this->assertFigures(30, '7.0000');            // (10x5 + 20x8) / 30, not (5+8) / 2

        $first = $this->item->batches()->orderBy('id')->first();
        $this->issue($first, 5);
        $this->assertFigures(25, '7.0000');            // an issue never changes the average

        $this->receive(15, 9);
        $this->assertFigures(40, '7.7500');            // (25x7 + 15x9) / 40
    }

    public function test_cancelling_an_issue_replays_every_later_receipt(): void
    {
        $this->receive(10, 5);
        $this->receive(20, 8);
        $issue = $this->issue($this->item->batches()->orderBy('id')->first(), 5);
        $this->receive(15, 9);

        $issue->forceFill(['status' => TransactionStatus::Cancelled])->save();
        $this->recalculate();

        $this->assertFigures(45, '7.6667');            // (30x7 + 15x9) / 45
    }

    public function test_editing_an_old_receipt_changes_the_average_but_not_earlier_snapshots(): void
    {
        $receipt = $this->receive(10, 5);
        $this->receive(20, 8);
        $issue = $this->issue($receipt->batch, 5);
        $this->assertSame('7.0000', $issue->unit_cost);

        $receipt->forceFill(['unit_cost' => 6])->save();
        $this->recalculate();

        $this->assertFigures(25, '7.3333');            // (10x6 + 20x8) / 30
        $this->assertSame('7.0000', $issue->fresh()->unit_cost, 'the issue keeps its historical cost');
    }

    public function test_an_item_that_never_received_stock_has_a_zero_average(): void
    {
        $this->recalculate();

        $this->assertFigures(0, '0.0000');
    }

    public function test_an_empty_item_keeps_its_last_average_until_the_next_receipt_sets_it(): void
    {
        $receipt = $this->receive(10, 5);
        $this->issue($receipt->batch, 10);
        $this->assertFigures(0, '5.0000');

        $this->receive(10, 9);
        $this->assertFigures(10, '9.0000');
    }

    public function test_a_disposal_lowers_the_stock_like_an_issue_and_keeps_the_average(): void
    {
        $receipt = $this->receive(10, 5);
        $this->issue($receipt->batch, 10, OutgoingReason::ExpiredDisposal);
        $this->assertFigures(0, '5.0000');

        $this->receive(10, 9);
        $this->assertFigures(10, '9.0000');
    }

    public function test_a_cancelled_receipt_takes_its_batch_out_of_stock_and_keeps_the_record(): void
    {
        $receipt = $this->receive(10, 5);
        $this->receive(20, 8);

        $receipt->forceFill(['status' => TransactionStatus::Cancelled])->save();
        $this->recalculate();

        $this->assertSame(0, $receipt->batch->fresh()->quantity);
        $this->assertFigures(20, '8.0000');
        $this->assertSame(2, $this->item->batches()->count());
    }

    public function test_a_batch_below_zero_is_refused_even_when_the_item_total_stays_positive(): void
    {
        $receiptA = $this->receive(10, 5);
        $this->issue($receiptA->batch, 8);
        $this->receive(5, 5);                          // another batch: the item total stays 3

        $receiptA->forceFill(['quantity' => 6])->save(); // batch A would reach 6 - 8 = -2

        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('negative quantity');
        $this->recalculate();
    }

    public function test_stock_cannot_leave_a_batch_on_a_date_before_its_receipt(): void
    {
        $receipt = $this->receive(10, 5, date: '2026-11-05');

        $this->expectException(ConflictException::class);
        $this->issue($receipt->batch, 2, date: '2026-11-03');
    }

    public function test_stock_cannot_leave_a_batch_recorded_before_its_receipt(): void
    {
        $receipt = $this->receive(10, 5);
        $issue = $this->issue($receipt->batch, 2);

        // The receipt now looks recorded after the issue.
        $receipt->forceFill(['created_at' => $issue->created_at->addMinute()])->save();

        $this->expectException(ConflictException::class);
        $this->recalculate();
    }

    public function test_a_refused_recalculation_saves_nothing(): void
    {
        $receipt = $this->receive(10, 5);
        $this->issue($receipt->batch, 8);

        try {
            DB::transaction(function () use ($receipt) {
                $this->stock->lockItems($this->item->id);
                $receipt->forceFill(['quantity' => 6])->save();
                $this->recalculate();
            });
        } catch (ConflictException) {
        }

        $this->assertSame(10, $receipt->fresh()->quantity, 'the edit was rolled back');
        $this->assertFigures(2, '5.0000');
    }

    public function test_items_are_locked_in_id_order(): void
    {
        $other = Item::factory()->create();

        $locked = DB::transaction(fn () => $this->stock->lockItems($other->id, $this->item->id, $other->id));

        $this->assertSame([$this->item->id, $other->id], $locked->keys()->all());
    }

    public function test_the_item_alerts_are_synced_after_every_recalculation(): void
    {
        $this->mock(NotificationService::class)
            ->shouldReceive('syncItem')->once()->withArgs(fn (Item $item) => $item->is($this->item));

        app(StockService::class)->recalculate($this->item);
    }

    // -- helpers --------------------------------------------------------------------------

    /** Records a receipt into a new batch, as POST /transactions/incoming will. */
    private function receive(int $quantity, float $unitCost, string $date = '2026-11-01'): Transaction
    {
        $this->travel(1)->minutes();                 // each transaction is recorded after the last
        $batch = Batch::create([
            'item_id' => $this->item->id,
            'batch_number' => 'B-'.++$this->batchCounter,
            'unit_cost' => $unitCost,
        ]);
        $transaction = Transaction::create([
            'type' => TransactionType::Incoming, 'item_id' => $this->item->id, 'batch_id' => $batch->id,
            'quantity' => $quantity, 'unit_cost' => $unitCost, 'date' => $date, 'recorded_by' => $this->user->id,
        ]);
        $this->recalculate();

        return $transaction;
    }

    /** Records an issue (or a disposal) at the item's current Average Cost, as the actions will. */
    private function issue(Batch $batch, int $quantity, OutgoingReason $reason = OutgoingReason::Issue, string $date = '2026-11-10'): Transaction
    {
        $this->travel(1)->minutes();
        $transaction = Transaction::create([
            'type' => TransactionType::Outgoing, 'reason' => $reason, 'item_id' => $this->item->id,
            'batch_id' => $batch->id, 'quantity' => $quantity, 'unit_cost' => $this->item->fresh()->avg_unit_cost,
            'recipient' => $reason === OutgoingReason::Issue ? 'Ward A' : null,
            'date' => $date, 'recorded_by' => $this->user->id,
        ]);
        $this->recalculate();

        return $transaction;
    }

    private function recalculate(): void
    {
        $this->stock->recalculate($this->item->fresh());
    }

    private function assertFigures(int $stock, string $average): void
    {
        $item = $this->item->fresh();
        $this->assertSame($stock, (int) $item->batches()->sum('quantity'), 'stock');
        $this->assertSame($average, $item->avg_unit_cost, 'average cost');
    }
}
