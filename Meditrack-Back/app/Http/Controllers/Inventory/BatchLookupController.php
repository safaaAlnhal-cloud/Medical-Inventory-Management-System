<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Resources\BatchLookupResource;
use App\Services\TransactionService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** GET /inventory/batches/lookup: every batch's number, to label a batchId anywhere. */
class BatchLookupController extends Controller
{
    public function __construct(private readonly TransactionService $transactions) {}

    public function index(): AnonymousResourceCollection
    {
        return BatchLookupResource::collection($this->transactions->batchLookup());
    }
}
