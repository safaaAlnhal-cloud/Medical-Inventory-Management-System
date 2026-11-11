<?php

namespace App\Services;

use App\Exceptions\ConflictException;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Transaction;
use Illuminate\Support\Collection;

/**
 * The one place that turns an item's transactions into its stock figures. Owner: Developer A.
 * BACKEND_HANDOFF.md: "Average Cost and Unit Cost", "Cancelled transactions", "Editing
 * transactions".
 *
 * Every action that changes stock (incoming, outgoing, disposal, edit, cancel) follows the same
 * pattern, inside one DB::transaction:
 *
 *     $this->stock->lockItems($itemId);   // 1. nobody else changes this item's stock meanwhile
 *     // 2. validate the request, save the transaction (and its batch)
 *     $this->stock->recalculate($item);   // 3. rebuild the figures; a broken history rolls it all back
 *
 * What is stored, and only written here:
 *   - batches.quantity      what is physically left in the batch (received - issued - disposed)
 *   - items.avg_unit_cost   the moving weighted Average Cost
 * What is NOT stored, because it changes with the date alone: available / expired quantities,
 * stock status, expiry status. They are worked out when read, from batches.quantity and today.
 */
class StockService
{
    public function __construct(private readonly NotificationService $notifications) {}

    /**
     * Locks the items' rows until the surrounding DB::transaction ends, so two requests cannot
     * change the same item's stock at once: the second waits, then sees the first one's result
     * (two people issuing the last 5 boxes at the same second cannot both succeed).
     *
     * Items are locked in id order, so two requests that both touch items 3 and 7 (an edit that
     * moves a transaction between them) never wait on each other forever.
     *
     * @return Collection<int, Item> keyed by id
     */
    public function lockItems(int ...$itemIds): Collection
    {
        $itemIds = array_values(array_unique($itemIds));
        sort($itemIds);

        return Item::whereKey($itemIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
    }

    /**
     * Rebuilds the item's batch quantities and Average Cost from scratch by replaying its active
     * transactions in recorded order, checks that the history is possible, saves the figures and
     * syncs the item's alerts. Call it after the item was locked, inside the same DB::transaction.
     *
     * Average Cost:
     *   incoming   (stock x average + quantity x unit price) / (stock + quantity)
     *   outgoing   (issue or disposal) stock goes down, the average does not change
     * An item that never received stock has 0; one whose stock reached 0 keeps its last average.
     * The unit_cost saved on outgoing transactions is never rewritten here: it is a snapshot.
     *
     * The replay is the final safety net. The actions check the request first and answer with a
     * precise 422 on the field (date before the receipt, quantity above what is available...);
     * whatever still slips through is refused here with a 409, and nothing is saved.
     *
     * @throws ConflictException when a batch would go below zero at any point of its history, or
     *                           stock would leave a batch before it was received
     */
    public function recalculate(Item $item): void
    {
        $batches = Batch::where('item_id', $item->id)->get()->keyBy('id');
        $transactions = Transaction::where('item_id', $item->id)->active()->inRecordedOrder()->get();

        $stock = 0;
        $average = 0.0;
        /** @var array<int, Transaction> $receipts batch id => its incoming transaction */
        $receipts = [];
        /** @var array<int, int> $balances batch id => quantity left at this point of the replay */
        $balances = [];

        foreach ($transactions as $transaction) {
            $batch = $batches->get($transaction->batch_id);
            if ($batch === null) {
                // The batch belongs to another item: the transaction and its batch disagree.
                throw new ConflictException('This change would link a transaction to a batch of another item.');
            }

            if ($transaction->isIncoming()) {
                if (isset($receipts[$batch->id])) {
                    throw new ConflictException("Batch {$batch->batch_number} would be received twice.");
                }
                $receipts[$batch->id] = $transaction;
                $balances[$batch->id] = $transaction->quantity;

                $average = ($stock * $average + $transaction->quantity * (float) $transaction->unit_cost)
                    / ($stock + $transaction->quantity);
                $stock += $transaction->quantity;

                continue;
            }

            // Outgoing (an issue or a disposal): the batch must already have been received, both
            // in recorded order and by date.
            $receipt = $receipts[$batch->id] ?? null;
            if ($receipt === null || $transaction->date->lessThan($receipt->date)) {
                throw new ConflictException("This change would take stock from batch {$batch->batch_number} before it was received.");
            }

            $balances[$batch->id] -= $transaction->quantity;
            if ($balances[$batch->id] < 0) {
                throw new ConflictException("This change would leave batch {$batch->batch_number} with a negative quantity.");
            }
            $stock -= $transaction->quantity;
        }

        // A batch with no active receipt (its incoming was cancelled or turned into an outgoing)
        // is out of stock. Only the rows whose figure changed are written.
        foreach ($batches as $batch) {
            $quantity = $balances[$batch->id] ?? 0;
            if ($batch->quantity !== $quantity) {
                $batch->forceFill(['quantity' => $quantity])->save();
            }
        }

        // Full precision during the replay; 4 decimals only when stored ("round the total, not
        // the unit cost").
        $item->forceFill(['avg_unit_cost' => round($average, 4)]);
        if ($item->isDirty('avg_unit_cost')) {
            $item->save();
        }

        $this->notifications->syncItem($item);
    }
}
