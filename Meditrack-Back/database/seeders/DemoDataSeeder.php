<?php

namespace Database\Seeders;

use App\Enums\OutgoingReason;
use App\Enums\TransactionType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Batch;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemBarcode;
use App\Models\Manufacturer;
use App\Models\Transaction;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Support\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

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
 *
 * Added for the supervisor's requirements (not in the mock yet; each owner adds them to the mock
 * with their feature): item details, manufacturers on batches, manufacturing dates, factory
 * barcodes (Paracetamol has two manufacturers and two barcodes), and Reem's account expiring in
 * 5 days so the account alerts can be seen. None of these change a stock figure or a cost.
 * Company names are made up for the demo.
 */
class DemoDataSeeder extends Seeder
{
    /** mock id => database id, per table */
    private array $userIds = [];
    private array $itemIds = [];
    private array $batchIds = [];

    /** manufacturer key => database id */
    private array $manufacturerIds = [];

    public function run(): void
    {
        DB::transaction(function () {
            $this->seedUsers();
            $categoryIds = $this->seedCategories();
            $this->seedItems($categoryIds);
            $this->seedManufacturers();
            $this->seedBarcodes();
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
            // [mock id, name, email, status, last active, account expires in days (null = never)]
            [2, 'Omar Saleh', 'omar@medcenter.ps', UserStatus::Active, now()->subMinutes(95), null],
            // A temporary contract: raises the "account expiring" alert for the admin and Reem.
            [3, 'Reem Haboush', 'reem@medcenter.ps', UserStatus::Active, $this->daysAgo(1, 16, 20), 5],
            [4, 'Mahmoud Ali', 'mahmoud@medcenter.ps', UserStatus::Inactive, $this->daysAgo(3, 11, 0), null],
            [5, 'Safaa Alnhal', 'safaa@medcenter.ps', UserStatus::Active, $this->daysAgo(0, 9, 0), null],
        ];

        foreach ($storekeepers as [$mockId, $name, $email, $status, $lastActiveAt, $expiresInDays]) {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'password' => 'store123',
                'role' => UserRole::Storekeeper,
                'status' => $status,
                'account_expires_on' => $expiresInDays === null ? null : today()->addDays($expiresInDays),
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

        // Optional details. Medicines have most of them; supplies only some, or none.
        $details = [
            1 => ['active_ingredient' => 'Paracetamol', 'strength' => '500 mg', 'dosage_form' => 'Tablet',
                'storage_conditions' => 'Store below 25°C in a dry place', 'uses' => 'Relief of mild to moderate pain and fever',
                'description' => '20 tablets per box'],
            2 => ['active_ingredient' => 'Amoxicillin', 'strength' => '250 mg', 'dosage_form' => 'Capsule',
                'storage_conditions' => 'Store below 25°C', 'uses' => 'Treatment of bacterial infections',
                'description' => '16 capsules per box'],
            3 => ['dosage_form' => null, 'storage_conditions' => 'Keep away from heat and sunlight',
                'description' => 'Latex, size M, 100 gloves per box'],
            4 => ['active_ingredient' => 'Sodium chloride', 'strength' => '0.9%', 'dosage_form' => 'Solution for infusion',
                'storage_conditions' => 'Store below 30°C, do not freeze', 'uses' => 'Fluid and electrolyte replacement',
                'description' => '500 ml bottle'],
            5 => ['description' => 'Sterile, single use, 100 syringes per box'],
            6 => [],
        ];

        foreach ($items as [$mockId, $name, $categoryId, $unit, $minQty]) {
            $this->itemIds[$mockId] = Item::create([
                'category_id' => $categoryIds[$categoryId],
                'name' => $name,
                'unit' => $unit,
                'min_qty' => $minQty,
                ...$details[$mockId],
            ])->id;
        }
    }

    private function seedManufacturers(): void
    {
        $manufacturers = [
            'nova' => 'Nova Pharma',
            'medica' => 'Medica Labs',
            'safecare' => 'SafeCare Industries',
            'purefluids' => 'PureFluids Co.',
            'cottonline' => 'CottonLine',
        ];

        foreach ($manufacturers as $key => $name) {
            $this->manufacturerIds[$key] = Manufacturer::create([
                'name' => $name,
                'normalized_name' => Manufacturer::normalize($name),
            ])->id;
        }
    }

    /** Factory barcodes: Paracetamol is made by two manufacturers, each with its own barcode. */
    private function seedBarcodes(): void
    {
        $barcodes = [
            // [mock item id, manufacturer key, barcode]
            [1, 'nova', '6291100100011'],
            [1, 'medica', '6291100200018'],
            [2, 'medica', '6291100200025'],
            [3, 'safecare', '6291100300015'],
            [4, 'purefluids', '6291100400012'],
            [5, 'safecare', '6291100300022'],
        ];

        foreach ($barcodes as [$itemId, $manufacturer, $barcode]) {
            ItemBarcode::create([
                'item_id' => $this->itemIds[$itemId],
                'manufacturer_id' => $this->manufacturerIds[$manufacturer],
                'barcode' => $barcode,
            ]);
        }
    }

    private function seedBatches(): void
    {
        $batches = [
            // [mock id, mock item id, batch number, unit cost, supplier, expiry in days (null = none),
            //  manufacturer key (null = unknown), manufactured days ago (null = unknown)]
            // The manufacturing date is always before the batch's receipt date.
            // Older batches, fully consumed.
            [1, 5, 'SY-501', 3.2, 'MedEquip', 400, 'safecare', 300],
            [2, 1, 'PC-090', 11.5, 'PharmaCo', 200, 'nova', 500],
            [3, 6, 'CR-590', 5.5, 'CareGoods', 250, 'cottonline', null],
            [4, 4, 'SS-390', 4.2, 'BioLab', 120, 'purefluids', 400],
            // Batches currently in stock. Paracetamol's two batches come from two manufacturers.
            [5, 1, 'PC-101', 12, 'PharmaCo', 430, 'nova', 300],
            [6, 1, 'PC-102', 13.25, 'MedGlobal', 520, 'medica', 200],
            [7, 6, 'CR-601', 6, 'CareGoods', 300, 'cottonline', null],
            [8, 3, 'SG-301', 25, 'MedEquip', null, 'safecare', null],
            [9, 2, 'AM-201', 8.75, 'HealthCare', 12, 'medica', 700],
            [10, 4, 'SS-401', 4.5, 'BioLab', 20, 'purefluids', 680],
        ];

        foreach ($batches as [$mockId, $itemId, $number, $unitCost, $supplier, $expiresInDays, $manufacturer, $madeDaysAgo]) {
            $this->batchIds[$mockId] = Batch::create([
                'item_id' => $this->itemIds[$itemId],
                'manufacturer_id' => $manufacturer === null ? null : $this->manufacturerIds[$manufacturer],
                'batch_number' => $number,
                'unit_cost' => $unitCost,
                'supplier' => $supplier,
                'manufacturing_date' => $madeDaysAgo === null ? null : today()->subDays($madeDaysAgo),
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
     * Fills the stored batches.quantity and items.avg_unit_cost with the same code every
     * transaction action uses, so the demo figures are exactly what the app would compute.
     */
    private function recalculateStock(): void
    {
        $stock = app(StockService::class);
        foreach (Item::all() as $item) {
            $stock->recalculate($item);
        }
    }

    private function daysAgo(int $days, int $hour, int $minute): Carbon
    {
        return now()->subDays($days)->setTime($hour, $minute);
    }
}
