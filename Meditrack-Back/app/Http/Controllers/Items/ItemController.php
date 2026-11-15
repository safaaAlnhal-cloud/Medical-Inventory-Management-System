<?php

namespace App\Http\Controllers\Items;

use App\Http\Controllers\Controller;
use App\Http\Requests\Items\ListItemsRequest;
use App\Http\Requests\Items\SaveItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Services\ItemService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ItemController extends Controller
{
    public function __construct(private readonly ItemService $items) {}

    public function index(ListItemsRequest $request): AnonymousResourceCollection
    {
        return ItemResource::collection($this->items->list($request->validated('search')));
    }

    public function archived(ListItemsRequest $request): AnonymousResourceCollection
    {
        return ItemResource::collection($this->items->archived($request->validated('search')));
    }

    public function lookup(): JsonResponse
    {
        return response()->json($this->items->lookup()->map(fn (Item $item) => [
            'id' => $item->id,
            'name' => $item->name,
            'unit' => $item->unit->value,
            'archived' => $item->isArchived(),
        ]));
    }

    public function store(SaveItemRequest $request): JsonResponse
    {
        $item = $this->items->create($request->validated());

        return (new ItemResource($item))->response()->setStatusCode(201);
    }

    public function update(SaveItemRequest $request, Item $item): ItemResource
    {
        return new ItemResource($this->items->update($item, $request->validated()));
    }
}
