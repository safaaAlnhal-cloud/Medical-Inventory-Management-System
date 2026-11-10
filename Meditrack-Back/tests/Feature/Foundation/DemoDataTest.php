<?php

namespace Tests\Feature\Foundation;

use App\Models\Item;
use App\Models\Transaction;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The demo data matches the frontend's mock data, so both modes show the same numbers. */
class DemoDataTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_stock_and_average_cost_match_the_mock(): void
    {
        $expected = [
            'Paracetamol 500mg' => [500, '12.5000'],
            'Amoxicillin 250mg' => [15, '8.7500'],
            'Surgical Gloves' => [8, '25.0000'],
            'Saline Solution 0.9%' => [120, '4.5000'],
            'Syringes 5ml' => [0, '3.2000'],
            'Cotton Rolls' => [300, '6.0000'],
        ];

        $items = Item::with('batches')->get();
        $this->assertCount(6, $items);

        foreach ($items as $item) {
            [$qty, $avg] = $expected[$item->name];
            $this->assertSame($qty, $item->batches->sum('quantity'), $item->name.': stock');
            $this->assertSame($avg, $item->avg_unit_cost, $item->name.': average cost');
        }
        $this->assertSame(21, Transaction::count());
    }

    public function test_the_admin_account_exists(): void
    {
        $this->assertTrue(User::where('email', 'sara@medcenter.ps')->firstOrFail()->isAdmin());
    }
}
