<?php

namespace Database\Seeders;

use App\Enums\OutgoingReason;
use App\Enums\TransactionType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Batch;
use App\Models\Category;
use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * The frontend's mock data (Meditrack-Front/src/mockData), so the app shows the same content in
 * API mode as in mock mode and the numbers can be compared side by side.
 *
 * Dates are relative to now, as in the mock, so expiry warnings, "today" transactions and the
 * 6-month chart stay meaningful whenever the seeder is run.
 *
 * The arrays keep the mock's ids; they are mapped to the ids the database gives each record.
 * Expected stock after seeding: Paracetamol 500, Amoxicillin 15, Gloves 8, Saline 120,
 * Syringes 0, Cotton Rolls 300.
 */
class DemoDataSeeder extends Seeder
{
    /** mock id => database id, per table */
    private array $userIds = [];
    private array $itemIds = [];
    private array $batchIds = [];

    public function run(): void
    {
        DB::transaction(function () {
            $this->seedUsers();
            $categoryIds = $this->seedCategories();
            $this->seedItems($categoryIds);
            $this->seedBatches();
            $this->seedTransactions();
            $this->recalculateStock();
        });
    }

    private function seedUsers(): void
    {
        // Mock user 1 is the admin, created by AdminSeeder.
        $this->userIds[1] = User::where('email', 'sara@medcenter.ps')->value('id');

        $storekeepers = [
            // [mock id, name, email, status, last active]
            [2, 'Omar Saleh', 'omar@medcenter.ps', UserStatus::Active, now()->subMinutes(95)],
            [3, 'Reem Haboush', 'reem@medcenter.ps', UserStatus::Active, $this->daysAgo(1, 16, 20)],
            [4, 'Mahmoud Ali', 'mahmoud@medcenter.ps', UserStatus::Inactive, $this->daysAgo(3, 11, 0)],
            [5, 'Safaa Alnhal', 'safaa@medcenter.ps', UserStatus::Active, $this->daysAgo(0, 9, 0)],
        ];

        foreach ($storekeepers as [$mockId, $name, $email, $status, $lastActiveAt]) {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'password' => 'store123',
                'role' => UserRole::Storekeeper,
                'status' => $status,
            ]);
            $user->forceFill(['last_active_at' => $lastActiveAt])->save();
            $this->userIds[$mockId] = $user->id;
        }

        User::whereKey($this->userIds[1])->update(['last_active_at' => now()->subMinutes(35)]);
    }

    /** @return array<int, int> mock id => database id */
    private function seedCategories(): array
    {
        $ids = [];
        foreach ([1 => 'Medications', 2 => 'Supplies', 3 => 'IV Fluids'] as $mockId => $name) {
            $ids[$mockId] = Category::create(['name' => $name])->id;
        }

        return $ids;
    }

    private function seedItems(array $categoryIds): void
    {
        $items = [
            // [mock id, name, mock category id, unit, minQty]
            [1, 'Paracetamol 500mg', 1, 'box', 20],
            [2, 'Amoxicillin 250mg', 1, 'box', 20],
            [3, 'Surgical Gloves', 2, 'box', 15],
            [4, 'Saline Solution 0.9%', 3, 'bottle', 30],
            [5, 'Syringes 5ml', 2, 'box', 50],
            [6, 'Cotton Rolls', 2, 'pack', 40],
        ];

        foreach ($items as [$mockId, $name, $categoryId, $unit, $minQty]) {
            $this->itemIds[$mockId] = Item::create([
                'category_id' => $categoryIds[$categoryId],
                'name' => $name,
                'unit' => $unit,
                'min_qty' => $minQty,
            ])->id;
        }
    }

    private function seedBatches(): void
    {
        $batches = [
            // [mock id, mock item id, batch number, unit cost, supplier, expiry in days (null = none)]
            // Older batches, fully consumed.
            [1, 5, 'SY-501', 3.2, 'MedEquip', 400],
            [2, 1, 'PC-090', 11.5, 'PharmaCo', 200],
            [3, 6, 'CR-590', 5.5, 'CareGoods', 250],
            [4, 4, 'SS-390', 4.2, 'BioLab', 120],
            // Batches currently in stock.
            [5, 1, 'PC-101', 12, 'PharmaCo', 430],
            [6, 1, 'PC-102', 13.25, 'MedGlobal', 520],
            [7, 6, 'CR-601', 6, 'CareGoods', 300],
            [8, 3, 'SG-301', 25, 'MedEquip', null],
            [9, 2, 'AM-201', 8.75, 'HealthCare', 12],
            [10, 4, 'SS-401', 4.5, 'BioLab', 20],
        ];

        foreach ($batches as [$mockId, $itemId, $number, $unitCost, $supplier, $expiresInDays]) {
            $this->batchIds[$mockId] = Batch::create([
                'item_id' => $this->itemIds[$itemId],
                'batch_number' => $number,
                'unit_cost' => $unitCost,
                'supplier' => $supplier,
                'expiry_date' => $expiresInDays === null ? null : today()->addDays($expiresInDays),
            ])->id;
        }
    }

    private function seedTransactions(): void
    {
        $in = TransactionType::Incoming;
        $out = TransactionType::Outgoing;

        $transactions = [
            // [type, when, mock batch id, quantity, unit cost (outgoing only), recipient, mock user id]
            // Older batches, fully consumed (they feed the 6-month stock movement chart).
            [$in, $this->daysAgo(150, 9, 30), 1, 180, null, null, 1],
            [$out, $this->daysAgo(140, 11, 0), 1, 70, 3.2, 'Emergency Department', 2],
            [$in, $this->daysAgo(120, 10, 15), 2, 220, null, null, 1],
            [$out, $this->daysAgo(110, 14, 0), 2, 120, 11.5, 'Outpatient Clinic', 2],
            [$out, $this->daysAgo(95, 9, 45), 1, 60, 3.2, 'Surgery Ward', 3],
            [$in, $this->daysAgo(90, 13, 20), 3, 200, null, null, 5],
            [$out, $this->daysAgo(75, 10, 30), 3, 200, 5.5, 'Emergency Department', 2],
            [$out, $this->daysAgo(70, 15, 10), 2, 100, 11.5, 'Pediatrics Ward', 3],
            [$in, $this->daysAgo(60, 9, 0), 4, 240, null, null, 1],
            [$out, $this->daysAgo(50, 12, 40), 4, 130, 4.2, 'Surgery Ward', 2],
            [$out, $this->daysAgo(45, 11, 25), 1, 50, 3.2, 'Outpatient Clinic', 5],
            [$out, $this->daysAgo(35, 16, 0), 4, 110, 4.2, 'Emergency Department', 2],
            // Batches currently in stock.
            [$in, $this->daysAgo(40, 10, 0), 5, 300, null, null, 1],
            [$in, $this->daysAgo(20, 11, 30), 6, 200, null, null, 1],
            [$in, $this->daysAgo(12, 9, 15), 7, 300, null, null, 3],
            [$in, $this->daysAgo(10, 14, 45), 8, 20, null, null, 5],
            [$in, $this->daysAgo(7, 10, 20), 9, 25, null, null, 1],
            [$in, $this->daysAgo(6, 9, 40), 10, 135, null, null, 1],
            [$out, $this->daysAgo(4, 13, 5), 10, 15, 4.5, 'Surgery Ward', 2],
            [$out, $this->daysAgo(1, 11, 5), 9, 10, 8.75, 'Outpatient Clinic', 2],
            [$out, now()->subMinutes(95), 8, 12, 25, 'Emergency Department', 2],
        ];

        foreach ($transactions as [$type, $when, $batchId, $quantity, $unitCost, $recipient, $userId]) {
            $batch = Batch::findOrFail($this->batchIds[$batchId]);
            $isIncoming = $type === TransactionType::Incoming;

            $transaction = new Transaction([
                'type' => $type,
                'reason' => $isIncoming ? null : OutgoingReason::Issue,
                'item_id' => $batch->item_id,
                'batch_id' => $batch->id,
                'quantity' => $quantity,
                // Incoming: the batch's purchase price. Outgoing: the Average Cost snapshot the
                // mock stored when the stock was issued.
                'unit_cost' => $isIncoming ? $batch->unit_cost : $unitCost,
                'recipient' => $recipient,
                'date' => $when->toDateString(),
                'recorded_by' => $this->userIds[$userId],
            ]);
            // createdAt sets the order the Average Cost is built up in, so it is the mock's
            // time, not the time the seeder ran.
            $transaction->created_at = $when;
            $transaction->updated_at = $when;
            $transaction->save();

            if ($isIncoming) {
                $batch->created_at = $when;
                $batch->updated_at = $when;
                $batch->save();
            }
        }
    }

    /**
     * TEMPORARY (phase 1). Fills the cached batches.quantity and items.avg_unit_cost by replaying
     * each item's active transactions in recorded order. Phase 5 replaces this with
     * StockService::recalculateItem(), the one place that logic will live.
     */
    private function recalculateStock(): void
    {
        foreach (Item::all() as $item) {
            $stock = 0;
            $average = 0.0;
            $batchQuantities = [];

            $transactions = $item->transactions()->active()->inRecordedOrder()->get();
            foreach ($transactions as $transaction) {
                $quantity = $transaction->quantity;
                $batchQuantities[$transaction->batch_id] ??= 0;

                if ($transaction->isIncoming()) {
                    $average = ($stock * $average + $quantity * (float) $transaction->unit_cost) / ($stock + $quantity);
                    $stock += $quantity;
                    $batchQuantities[$transaction->batch_id] += $quantity;
                } else {
                    $stock -= $quantity;
                    $batchQuantities[$transaction->batch_id] -= $quantity;
                }

                if ($batchQuantities[$transaction->batch_id] < 0) {
                    throw new RuntimeException("Demo data leaves batch {$transaction->batch_id} negative.");
                }
            }

            foreach ($batchQuantities as $batchId => $quantity) {
                Batch::whereKey($batchId)->update(['quantity' => $quantity]);
            }
            $item->forceFill(['avg_unit_cost' => round($average, 4)])->save();
        }
    }

    private function daysAgo(int $days, int $hour, int $minute): Carbon
    {
        return now()->subDays($days)->setTime($hour, $minute);
    }
}
