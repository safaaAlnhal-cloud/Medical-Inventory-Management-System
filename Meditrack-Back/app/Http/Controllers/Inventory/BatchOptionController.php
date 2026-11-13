<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Resources\BatchOptionResource;
use App\Models\Item;
use App\Services\TransactionService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** GET /inventory/{item}/batch-options?manufacturerId=: the batch list of the Outgoing form. */
class BatchOptionController extends Controller
{
    public function __construct(private readonly TransactionService $transactions) {}

    // {item} is found by its id; an unknown id is a 404 before this runs.
    public function index(Request $request, Item $item): AnonymousResourceCollection
    {
        $validated = $request->validate(
            ['manufacturerId' => ['nullable', 'integer']],
            ['manufacturerId.integer' => 'Choose a manufacturer from the list.'],
        );
        $manufacturerId = isset($validated['manufacturerId']) ? (int) $validated['manufacturerId'] : null;

        return BatchOptionResource::collection($this->transactions->batchOptions($item, $manufacturerId));
    }
}
