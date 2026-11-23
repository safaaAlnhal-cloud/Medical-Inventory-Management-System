<?php

namespace Tests\Feature\Foundation;

use App\Enums\OutgoingReason;
use App\Enums\TransactionStatus;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemArchival;
use App\Models\Transaction;
use App\Models\TransactionRevision;
use App\Models\User;
use Database\Seeders\AdminSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * DemoDataSeeder matches the frontend's mock data, so both modes show the same numbers.
 * ShowcaseDataSeeder adds the other demo cases on top (API only).
 */
class DemoDataTest extends TestCase
{
    use RefreshDatabase;

    public function test_stock_and_average_cost_match_the_mock(): void
    {
        $this->seed([AdminSeeder::class, DemoDataSeeder::class]);

        $this->assertStock([
            'Paracetamol 500mg' => [500, '12.5000'],
            'Amoxicillin 250mg' => [15, '8.7500'],
            'Surgical Gloves' => [8, '25.0000'],
            'Saline Solution 0.9%' => [120, '4.5000'],
            'Syringes 5ml' => [0, '3.2000'],
            'Cotton Rolls' => [300, '6.0000'],
        ]);
        $this->assertSame(21, Transaction::count());
    }

    public function test_the_showcase_data_holds_every_demo_case(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertStock([
            'Paracetamol 500mg' => [500, '12.5000'],
            'Amoxicillin 250mg' => [15, '8.7500'],
            'Surgical Gloves' => [8, '25.0000'],
            'Saline Solution 0.9%' => [120, '4.5000'],
            'Syringes 5ml' => [0, '3.2000'],
            'Cotton Rolls' => [300, '6.0000'],
            // (100x6 - 40 + 80x8 - 50 - 25, then 60 at 7.25 after the price was corrected)
            'Ibuprofen 400mg' => [125, '7.1943'],
            'Omeprazole 20mg' => [12, '4.0000'],
            'Cetirizine 10mg' => [50, '2.7000'],
            'Povidone-Iodine 10%' => [20, '5.5000'],
            'Alcohol Swabs' => [100, '1.2000'],
            'Glucose Test Strips' => [0, '15.0000'],
            'Digital Thermometer' => [0, '0.0000'],
            'Salbutamol Inhaler' => [25, '9.0000'],
            'Nebulizer Masks' => [0, '3.0000'],
            'Face Masks' => [110, '0.6000'],
        ]);

        $this->assertSame(6, Category::count());
        $this->assertSame(2, Transaction::where('status', TransactionStatus::Cancelled)->count());
        $this->assertSame(1, Transaction::where('reason', OutgoingReason::ExpiredDisposal)->count());
        $this->assertSame(2, TransactionRevision::count());
        $this->assertSame(2, ItemArchival::count());
        $this->assertNotNull(Item::where('name', 'Nebulizer Masks')->value('archived_at'));
        $this->assertNull(Item::where('name', 'Face Masks')->value('archived_at'));
        $this->assertTrue(User::where('email', 'khaled@medcenter.ps')->firstOrFail()->account_expires_on->isPast());
    }

    public function test_the_admin_account_exists(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertTrue(User::where('email', 'sara@medcenter.ps')->firstOrFail()->isAdmin());
    }

    /** @param  array<string, array{int, string}>  $expected  item name => [stock, Average Cost] */
    private function assertStock(array $expected): void
    {
        $items = Item::with('batches')->get();
        $this->assertCount(count($expected), $items);

        foreach ($items as $item) {
            [$qty, $avg] = $expected[$item->name];
            $this->assertSame($qty, $item->batches->sum('quantity'), $item->name.': stock');
            $this->assertSame($avg, $item->avg_unit_cost, $item->name.': average cost');
        }
    }
}
