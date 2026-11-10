<?php

namespace App\Services;

use App\Models\Item;
use App\Models\User;

/**
 * SHARED CONTRACT. Owner: Developer B (phase 4). Called by Developer A after every stock change.
 * The signatures are agreed: change them only together. BACKEND_HANDOFF.md section 4.6.
 *
 * The notifications table holds the alert conditions that exist right now. A sync compares it
 * with the current state: it adds the alerts that started (first_seen_at = now) and deletes the
 * ones that were resolved, with their read state. An alert that stays keeps its id and createdAt.
 *
 * Until phase 4 the methods do nothing, so Developer A can already call them: the calls start
 * working when Developer B fills them in, with no change on A's side.
 */
class NotificationService
{
    /**
     * Brings one item's alerts up to date: low_stock / out_of_stock for the item, and expiring for
     * each of its batches. An archived item ends up with none.
     *
     * Call it at the end of the same DB::transaction that changed the item, after its stock and
     * Average Cost were recalculated:
     *   - Developer A: StockService calls it once per affected item, which covers incoming,
     *     outgoing, disposal, edit and cancel (an edit that moves a transaction to another item
     *     syncs both items).
     *   - Developer B: archive, restore, and an edit of min_qty in PUT /inventory/{item}.
     */
    public function syncItem(Item $item): void
    {
        // Phase 4 (Developer B).
    }

    /**
     * Brings one account's alerts up to date: account_expiring / account_expires_today for an
     * active storekeeper, none otherwise.
     *
     * Called by Developer B when a user is created, or its status or account_expires_on changes.
     */
    public function syncUser(User $user): void
    {
        // Phase 4 (Developer B).
    }

    /**
     * Re-syncs every item and user. Some alerts change with the date alone (a batch becomes
     * expiring soon, an account's last day arrives), so this runs once a day from the scheduler
     * (routes/console.php) and at the end of the demo seeder.
     */
    public function syncAll(): void
    {
        // Phase 4 (Developer B).
    }
}
