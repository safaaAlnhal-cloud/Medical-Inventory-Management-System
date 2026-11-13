<?php

namespace App\Http\Controllers\Transactions;

use App\Enums\TransactionType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Transactions\ListTransactionsRequest;
use App\Http\Requests\Transactions\StoreOutgoingTransactionRequest;
use App\Http\Resources\TransactionResource;
use App\Services\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class OutgoingTransactionController extends Controller
{
    public function __construct(private readonly TransactionService $transactions) {}

    /** Issues and expired stock disposals, both outgoing. */
    public function index(ListTransactionsRequest $request): AnonymousResourceCollection
    {
        return TransactionResource::collection(
            $this->transactions->list(TransactionType::Outgoing, $request->validated()),
        );
    }

    public function store(StoreOutgoingTransactionRequest $request): JsonResponse
    {
        $transaction = $this->transactions->recordIssue($request->validated(), $request->user());

        return TransactionResource::make($transaction)->response()->setStatusCode(201);
    }
}
