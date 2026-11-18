<?php

namespace App\Http\Controllers\Notifications;

use App\Http\Controllers\Controller;
use App\Http\Requests\Notifications\ListNotificationsRequest;
use App\Http\Resources\NotificationResource;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/** BACKEND_HANDOFF.md sections 4.6 (notifications) and 4.7 (/dashboard/alerts). */
class NotificationController extends Controller
{
    /** /dashboard/alerts without ?limit= */
    private const DEFAULT_ALERTS_LIMIT = 3;

    public function __construct(private readonly NotificationService $notifications) {}

    public function index(ListNotificationsRequest $request): AnonymousResourceCollection
    {
        return NotificationResource::collection($this->notifications->feed($request->user(), $request->validated('search')));
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['count' => $this->notifications->unreadCount($request->user())]);
    }

    public function markRead(Request $request, string $key): NotificationResource
    {
        return new NotificationResource($this->notifications->markRead($request->user(), $key));
    }

    public function markAllRead(Request $request): Response
    {
        $this->notifications->markAllRead($request->user());

        return response()->noContent();
    }

    /** The first alerts of the same list, for the dashboards. */
    public function dashboardAlerts(ListNotificationsRequest $request): AnonymousResourceCollection
    {
        $limit = (int) ($request->validated('limit') ?? self::DEFAULT_ALERTS_LIMIT);

        return NotificationResource::collection(
            $this->notifications->feed($request->user(), $request->validated('search'))->take($limit),
        );
    }
}
