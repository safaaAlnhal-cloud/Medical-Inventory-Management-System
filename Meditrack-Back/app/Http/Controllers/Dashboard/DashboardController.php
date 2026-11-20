<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Resources\TransactionResource;
use App\Services\DashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * BACKEND_HANDOFF.md section 4.7. Each dashboard section is loaded by its own request, so one
 * failing never hides the others. /dashboard/alerts is in NotificationController.
 */
class DashboardController extends Controller
{
    private const DEFAULT_MONTHS = 6;

    private const DEFAULT_RECENT_LIMIT = 5;

    public function __construct(private readonly DashboardService $dashboard) {}

    /** GET /dashboard/summary: any signed-in user. */
    public function summary(): JsonResponse
    {
        return response()->json($this->dashboard->summary());
    }

    /** GET /dashboard/stock-movement?months=6: admin only (the route says so). */
    public function stockMovement(Request $request): JsonResponse
    {
        $validated = $request->validate(
            ['months' => ['nullable', 'integer', 'min:1', 'max:24']],
            ['months.*' => 'months must be a whole number from 1 to 24.'],
        );

        return response()->json($this->dashboard->stockMovement((int) ($validated['months'] ?? self::DEFAULT_MONTHS)));
    }

    /** GET /dashboard/recent-transactions?search=&limit=5: any signed-in user. */
    public function recentTransactions(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ], [
            'search.*' => 'Search may not be longer than 100 characters.',
            'limit.*' => 'limit must be a whole number from 1 to 50.',
        ]);

        return TransactionResource::collection($this->dashboard->recentTransactions(
            $validated['search'] ?? null,
            (int) ($validated['limit'] ?? self::DEFAULT_RECENT_LIMIT),
        ));
    }
}
