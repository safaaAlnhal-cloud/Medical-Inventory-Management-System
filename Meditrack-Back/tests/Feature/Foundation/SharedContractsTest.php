<?php

namespace Tests\Feature\Foundation;

use App\Enums\ReportType;
use App\Models\Item;
use App\Models\User;
use App\Reports\ReportFilters;
use App\Reports\ReportResult;
use App\Services\ManufacturerService;
use App\Services\NotificationService;
use App\Services\ReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Locks the services the two tracks share. If one of these fails, a signature that the other
 * developer relies on was changed: agree on the change together, then update this test.
 */
class SharedContractsTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_signatures_are_the_agreed_ones(): void
    {
        $this->assertSignature(ManufacturerService::class, 'resolve', '(string $name): App\Models\Manufacturer');
        $this->assertSignature(ManufacturerService::class, 'search', '(?string $search): Illuminate\Support\Collection');
        $this->assertSignature(NotificationService::class, 'syncItem', '(App\Models\Item $item): void');
        $this->assertSignature(NotificationService::class, 'syncUser', '(App\Models\User $user): void');
        $this->assertSignature(NotificationService::class, 'syncAll', '(): void');
        $this->assertSignature(ReportService::class, 'build',
            '(App\Enums\ReportType $type, App\Reports\ReportFilters $filters, ?int $page, ?int $pageSize): App\Reports\ReportResult');
    }

    public function test_notification_sync_can_already_be_called(): void
    {
        $sync = app(NotificationService::class);
        $sync->syncItem(Item::factory()->create());
        $sync->syncUser(User::factory()->create());
        $sync->syncAll();

        $this->assertTrue(true, 'no-ops until phase 4, so StockService can call them from day one');
    }

    public function test_report_result_has_the_api_envelope(): void
    {
        $result = new ReportResult(ReportType::Summary, ['totalItems' => 6], [], [['id' => 1, 'itemId' => 1]],
            ['page' => 1, 'pageSize' => 5, 'totalItems' => 6, 'totalPages' => 2]);

        $this->assertSame(['type', 'totals', 'breakdown', 'rows', 'pagination'], array_keys($result->toArray()));
        $this->assertSame('summary', $result->toArray()['type']);
        $this->assertSame(1, $result->rowCount());
    }

    public function test_report_filters_from_the_query_and_back(): void
    {
        $filters = ReportFilters::fromArray(['from' => '2026-10-01', 'to' => '2026-10-31', 'categoryId' => '2', 'search' => '  para ']);

        $this->assertSame(2, $filters->categoryId);
        $this->assertNull($filters->itemId);
        $this->assertSame('para', $filters->search);
        $this->assertSame(['from' => '2026-10-01', 'to' => '2026-10-31', 'categoryId' => 2, 'search' => 'para'], $filters->toArray());
    }

    public function test_which_reports_use_the_period(): void
    {
        $this->assertFalse(ReportType::Summary->usesPeriod());
        $this->assertFalse(ReportType::CriticalItems->usesPeriod());
        $this->assertTrue(ReportType::MovementHistory->usesPeriod());
        $this->assertTrue(ReportType::InventoryValue->usesPeriod());
    }

    private function assertSignature(string $class, string $method, string $expected): void
    {
        $reflection = new ReflectionMethod($class, $method);
        $params = array_map(
            fn ($p) => trim(($p->getType() ? $p->getType().' ' : '').'$'.$p->getName()),
            $reflection->getParameters(),
        );

        $this->assertSame($expected, '('.implode(', ', $params).'): '.$reflection->getReturnType(), "$class::$method");
    }
}
