<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemBarcode;
use App\Models\Manufacturer;
use App\Models\Transaction;
use App\Models\User;
use App\Services\ItemService;
use App\Services\NotificationService;
use App\Services\TransactionService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Demo data on top of DemoDataSeeder (the mock's data), so every case the app handles can be
 * shown on the API: low, out of stock and never stocked items, an expired batch awaiting
 * disposal, a batch expiring soon, a past disposal, edited transactions with their history,
 * cancelled incoming and outgoing transactions, a deactivated item, an item deactivated and
 * reactivated, six categories (the Inventory Value donut shows four and "Other") and an expired
 * account. Not in the mock: the mock checks are built on the mock's own figures.
 *
 * Every change goes through the services the API uses, at the time it "happened": the clock is
 * moved to that moment first (Carbon::setTestNow), so created_at, edited_at, cancelled_at and
 * archived_at are those times, and each rule is checked as it would have been then. Dates are
 * relative to today, so expiry warnings stay meaningful whenever the seeder is run.
 *
 * Expected stock: Ibuprofen 125, Omeprazole 12 (low), Cetirizine 30 + 20 expired, Povidone-Iodine
 * 20 (expiring soon), Alcohol Swabs 100, Glucose Test Strips 0 (out), Digital Thermometer 0
 * (never stocked), Salbutamol 25, Nebulizer Masks 0 (deactivated), Face Masks 110.
 */
class ShowcaseDataSeeder extends Seeder
{
    private Carbon $today;

    /** item key => Item */
    private array $items = [];

    /** batch number => batch id */
    private array $batches = [];

    /** email => User */
    private array $users = [];

    public function __construct(
        private readonly TransactionService $transactions,
        private readonly ItemService $itemService,
    ) {}

    public function run(): void
    {
        $this->today = today();

        try {
            DB::transaction(function () {
                $this->loadUsers();
                $this->seedExpiredAccount();
                $this->seedItems();

                $this->ibuprofen();
                $this->omeprazole();
                $this->cetirizine();
                $this->povidoneIodine();
                $this->alcoholSwabs();
                $this->glucoseStrips();
                $this->salbutamol();
                $this->nebulizerMasks();
                $this->faceMasks();
            });
        } finally {
            Carbon::setTestNow();
        }

        // Alerts as of the real today (the replays above synced them at past times).
        app(NotificationService::class)->syncAll();
    }

    private function loadUsers(): void
    {
        foreach (['sara', 'omar', 'reem', 'safaa'] as $name) {
            $this->users[$name] = User::where('email', "{$name}@medcenter.ps")->firstOrFail();
        }
    }

    /** Login refused (403) and the account shown as Expired on the Users page. */
    private function seedExpiredAccount(): void
    {
        $user = User::create([
            'name' => 'Khaled Nasser',
            'email' => 'khaled@medcenter.ps',
            'password' => 'store123',
            'role' => UserRole::Storekeeper,
            'status' => UserStatus::Active,
            'account_expires_on' => $this->today->copy()->subDays(3),
        ]);
        $user->forceFill(['last_active_at' => $this->today->copy()->subDays(4)->setTime(14, 10)])->save();
    }

    private function seedItems(): void
    {
        $categories = Category::pluck('id', 'name')->all();
        foreach (['Antiseptics', 'Diagnostics', 'Respiratory'] as $name) {
            $categories[$name] = Category::create(['name' => $name])->id;
        }

        $items = [
            // [key, name, category, unit, minQty, details]
            ['ibuprofen', 'Ibuprofen 400mg', 'Medications', 'box', 25, ['active_ingredient' => 'Ibuprofen', 'strength' => '400 mg',
                'dosage_form' => 'Tablet', 'storage_conditions' => 'Store below 25°C', 'uses' => 'Pain, fever and inflammation', 'description' => '30 tablets per box']],
            ['omeprazole', 'Omeprazole 20mg', 'Medications', 'box', 20, ['active_ingredient' => 'Omeprazole', 'strength' => '20 mg',
                'dosage_form' => 'Capsule', 'uses' => 'Stomach acid and ulcers', 'description' => '14 capsules per box']],
            ['cetirizine', 'Cetirizine 10mg', 'Medications', 'box', 15, ['active_ingredient' => 'Cetirizine', 'strength' => '10 mg',
                'dosage_form' => 'Tablet', 'uses' => 'Allergy relief', 'description' => '10 tablets per box']],
            ['povidone', 'Povidone-Iodine 10%', 'Antiseptics', 'bottle', 10, ['active_ingredient' => 'Povidone-iodine', 'strength' => '10%',
                'dosage_form' => 'Solution', 'storage_conditions' => 'Protect from light', 'description' => '120 ml bottle']],
            ['swabs', 'Alcohol Swabs', 'Antiseptics', 'pack', 30, ['description' => '100 swabs per pack']],
            ['strips', 'Glucose Test Strips', 'Diagnostics', 'box', 10, ['description' => '50 strips per box']],
            ['thermometer', 'Digital Thermometer', 'Diagnostics', 'piece', 5, []],
            ['salbutamol', 'Salbutamol Inhaler', 'Respiratory', 'piece', 10, ['active_ingredient' => 'Salbutamol', 'strength' => '100 mcg',
                'dosage_form' => 'Inhaler', 'uses' => 'Asthma relief', 'description' => '200 doses per inhaler']],
            ['nebulizer', 'Nebulizer Masks', 'Respiratory', 'piece', 10, ['description' => 'Single-use, adult size']],
            ['masks', 'Face Masks', 'Supplies', 'box', 20, ['description' => '50 masks per box']],
        ];

        foreach ($items as [$key, $name, $category, $unit, $minQty, $details]) {
            $this->items[$key] = Item::create([
                'category_id' => $categories[$category],
                'name' => $name,
                'unit' => $unit,
                'min_qty' => $minQty,
                ...$details,
            ]);
        }
    }

    // ---- One item per case -------------------------------------------------------------------

    /** Available, two manufacturers, the Average Cost over three receipts, and two edits. */
    private function ibuprofen(): void
    {
        $this->receive('ibuprofen', 170, 'IB-101', 100, 6, 'sara', expiresIn: 400, manufacturer: 'Nova Pharma', supplier: 'PharmaCo');
        $this->issue('ibuprofen', 160, 'IB-101', 40, 'Outpatient Clinic', 'omar');
        $this->receive('ibuprofen', 130, 'IB-102', 80, 8, 'sara', expiresIn: 500, manufacturer: 'Gulf Medical', supplier: 'MedGlobal');
        $this->issue('ibuprofen', 100, 'IB-101', 50, 'Emergency Department', 'reem');
        $issue = $this->issue('ibuprofen', 60, 'IB-102', 30, 'Surgery Ward', 'omar');
        // Two days later the ward returned 5: the quantity is corrected (History shows 30 -> 25).
        $this->editIssue($issue, 58, quantity: 25, by: 'sara');
        $receipt = $this->receive('ibuprofen', 20, 'IB-103', 60, 7.5, 'safaa', expiresIn: 450, manufacturer: 'Nova Pharma', supplier: 'PharmaCo');
        // The invoice said 7.25: the price is corrected the next day.
        $this->editReceipt($receipt, 19, unitCost: 7.25, by: 'sara');

        ItemBarcode::create(['item_id' => $this->items['ibuprofen']->id, 'manufacturer_id' => $this->manufacturer('Nova Pharma'), 'barcode' => '6291100100035']);
        ItemBarcode::create(['item_id' => $this->items['ibuprofen']->id, 'manufacturer_id' => $this->manufacturer('Gulf Medical'), 'barcode' => '6291100500016']);
    }

    /** Low stock: 12 left, the minimum is 20. */
    private function omeprazole(): void
    {
        $this->receive('omeprazole', 90, 'OM-201', 60, 4, 'sara', expiresIn: 300, manufacturer: 'Medica Labs', supplier: 'HealthCare');
        $this->issue('omeprazole', 70, 'OM-201', 20, 'Outpatient Clinic', 'omar');
        $this->issue('omeprazole', 30, 'OM-201', 25, 'Internal Medicine', 'reem');
        $this->issue('omeprazole', 5, 'OM-201', 3, 'Emergency Department', 'omar');
    }

    /** An expired batch with 20 still in stock (to dispose of), and a valid batch beside it. */
    private function cetirizine(): void
    {
        $this->receive('cetirizine', 200, 'CT-301', 50, 2.5, 'sara', expiresIn: -10, manufacturer: 'Medica Labs', supplier: 'HealthCare');
        $this->issue('cetirizine', 150, 'CT-301', 30, 'Outpatient Clinic', 'omar');
        $this->receive('cetirizine', 40, 'CT-302', 40, 2.8, 'sara', expiresIn: 365, manufacturer: 'Medica Labs', supplier: 'HealthCare');
        $this->issue('cetirizine', 15, 'CT-302', 10, 'Pediatrics Ward', 'reem');
    }

    /** A past disposal of an expired batch, and the current batch expiring in 20 days. */
    private function povidoneIodine(): void
    {
        $this->receive('povidone', 180, 'PI-401', 30, 5, 'sara', expiresIn: -60, manufacturer: 'SafeCare Industries', supplier: 'MedEquip');
        $this->issue('povidone', 150, 'PI-401', 18, 'Surgery Ward', 'omar');
        $this->dispose('povidone', 55, 'PI-401', 12, 'sara');
        $this->receive('povidone', 45, 'PI-402', 25, 5.5, 'safaa', expiresIn: 20, manufacturer: 'SafeCare Industries', supplier: 'MedEquip');
        $this->issue('povidone', 10, 'PI-402', 5, 'Emergency Department', 'omar');
    }

    /** No expiry date: never expired or expiring. */
    private function alcoholSwabs(): void
    {
        $this->receive('swabs', 120, 'AS-501', 200, 1.2, 'sara', expiresIn: null, manufacturer: 'CottonLine', supplier: 'CareGoods');
        $this->issue('swabs', 80, 'AS-501', 60, 'Emergency Department', 'reem');
        $this->issue('swabs', 25, 'AS-501', 40, 'Surgery Ward', 'omar');
    }

    /** Out of stock: everything received was issued. */
    private function glucoseStrips(): void
    {
        $this->receive('strips', 110, 'GS-601', 30, 15, 'sara', expiresIn: 200, manufacturer: 'Medica Labs', supplier: 'HealthCare');
        $this->issue('strips', 65, 'GS-601', 18, 'Internal Medicine', 'omar');
        $this->issue('strips', 8, 'GS-601', 12, 'Outpatient Clinic', 'reem');
    }

    /** A receipt recorded twice and cancelled, and an issue to the wrong ward cancelled and recorded again. */
    private function salbutamol(): void
    {
        $this->receive('salbutamol', 75, 'SB-701', 40, 9, 'sara', expiresIn: 400, manufacturer: 'AeroMed', supplier: 'MedGlobal');
        $duplicate = $this->receive('salbutamol', 74, 'SB-702', 40, 9, 'safaa', expiresIn: 400, manufacturer: 'AeroMed', supplier: 'MedGlobal');
        $this->cancel($duplicate, 74, 'sara');
        $wrongWard = $this->issue('salbutamol', 35, 'SB-701', 15, 'Pediatrics Ward', 'safaa');
        $this->cancel($wrongWard, 34, 'sara');
        $this->issue('salbutamol', 33, 'SB-701', 15, 'Emergency Department', 'safaa');
    }

    /** Deactivated once its stock ran out, with the reason in its archive history. */
    private function nebulizerMasks(): void
    {
        $this->receive('nebulizer', 140, 'NM-801', 20, 3, 'sara', expiresIn: null, manufacturer: 'AeroMed', supplier: 'MedEquip');
        $this->issue('nebulizer', 100, 'NM-801', 20, 'Respiratory Unit', 'omar');
        $this->at(90, fn () => $this->itemService->archive($this->items['nebulizer'], 'Replaced by a reusable model.', $this->users['sara']));
    }

    /** Deactivated, then reactivated and stocked again: its history shows both. */
    private function faceMasks(): void
    {
        $this->receive('masks', 160, 'FM-901', 100, 0.5, 'sara', expiresIn: null, manufacturer: 'SafeCare Industries', supplier: 'CareGoods');
        $this->issue('masks', 130, 'FM-901', 100, 'Emergency Department', 'omar');
        $this->at(125, fn () => $this->itemService->archive($this->items['masks'], 'The supplier stopped making this model.', $this->users['sara']));
        $this->at(50, fn () => $this->itemService->restore($this->items['masks'], $this->users['sara']));
        $this->receive('masks', 48, 'FM-902', 150, 0.6, 'sara', expiresIn: null, manufacturer: 'SafeCare Industries', supplier: 'CareGoods');
        $this->issue('masks', 12, 'FM-902', 40, 'Outpatient Clinic', 'reem');
    }

    // ---- Steps, each at its own moment ------------------------------------------------------

    /** Runs $step with the clock set to $daysAgo at a working hour, so its records carry that time. */
    private function at(int $daysAgo, callable $step, int $hour = 10): mixed
    {
        Carbon::setTestNow($this->today->copy()->subDays($daysAgo)->setTime($hour, ($daysAgo * 7) % 60));

        return $step();
    }

    private function receive(string $item, int $daysAgo, string $batch, int $quantity, float $unitCost, string $by,
        ?int $expiresIn, string $manufacturer, string $supplier): Transaction
    {
        $transaction = $this->at($daysAgo, fn () => $this->transactions->recordIncoming([
            'itemId' => $this->items[$item]->id,
            'batchNumber' => $batch,
            'quantity' => $quantity,
            'unitCost' => $unitCost,
            'date' => $this->day($daysAgo),
            'expiryDate' => $expiresIn === null ? null : $this->today->copy()->addDays($expiresIn)->toDateString(),
            'supplier' => $supplier,
            'manufacturer' => $manufacturer,
            'manufacturingDate' => $this->day($daysAgo + 90),
        ], $this->users[$by]), hour: 9);
        $this->batches[$batch] = $transaction->batch_id;

        return $transaction;
    }

    private function issue(string $item, int $daysAgo, string $batch, int $quantity, string $recipient, string $by): Transaction
    {
        return $this->at($daysAgo, fn () => $this->transactions->recordIssue([
            'itemId' => $this->items[$item]->id,
            'batchId' => $this->batches[$batch],
            'quantity' => $quantity,
            'date' => $this->day($daysAgo),
            'recipient' => $recipient,
        ], $this->users[$by]), hour: 13);
    }

    private function dispose(string $item, int $daysAgo, string $batch, int $quantity, string $by): Transaction
    {
        return $this->at($daysAgo, fn () => $this->transactions->recordDisposal([
            'itemId' => $this->items[$item]->id,
            'batchId' => $this->batches[$batch],
            'quantity' => $quantity,
            'date' => $this->day($daysAgo),
        ], $this->users[$by]), hour: 11);
    }

    private function cancel(Transaction $transaction, int $daysAgo, string $by): void
    {
        $this->at($daysAgo, fn () => $this->transactions->cancel($transaction, $this->users[$by]), hour: 15);
    }

    /** The edit form sends every field, so the unchanged ones are sent as they are. */
    private function editIssue(Transaction $transaction, int $daysAgo, int $quantity, string $by): void
    {
        $this->at($daysAgo, fn () => $this->transactions->update($transaction, [
            'type' => 'outgoing',
            'itemId' => $transaction->item_id,
            'quantity' => $quantity,
            'date' => $transaction->date->toDateString(),
            'batchId' => $transaction->batch_id,
            'recipient' => $transaction->recipient,
        ], $this->users[$by]), hour: 16);
    }

    private function editReceipt(Transaction $transaction, int $daysAgo, float $unitCost, string $by): void
    {
        $batch = $transaction->batch;
        $this->at($daysAgo, fn () => $this->transactions->update($transaction, [
            'type' => 'incoming',
            'itemId' => $transaction->item_id,
            'quantity' => $transaction->quantity,
            'date' => $transaction->date->toDateString(),
            'batchNumber' => $batch->batch_number,
            'unitCost' => $unitCost,
            'expiryDate' => $batch->expiry_date?->toDateString(),
            'supplier' => $batch->supplier,
            'manufacturer' => Manufacturer::find($batch->manufacturer_id)?->name,
            'manufacturingDate' => $batch->manufacturing_date?->toDateString(),
        ], $this->users[$by]), hour: 16);
    }

    private function manufacturer(string $name): int
    {
        return Manufacturer::where('normalized_name', Manufacturer::normalize($name))->value('id');
    }

    private function day(int $daysAgo): string
    {
        return $this->today->copy()->subDays($daysAgo)->toDateString();
    }
}
