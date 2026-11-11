<?php

namespace App\Http\Controllers\Transactions;

use App\Enums\TransactionType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Transactions\ListTransactionsRequest;
use App\Http\Requests\Transactions\StoreIncomingTransactionRequest;
use App\Http\Resources\TransactionResource;
use App\Services\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class IncomingTransactionController extends Controller
{
    public function __construct(private readonly TransactionService $transactions) {}

    public function index(ListTransactionsRequest $request): AnonymousResourceCollection
    {
        return TransactionResource::collection(
            $this->transactions->list(TransactionType::Incoming, $request->validated()),
        );
    }

    public function store(StoreIncomingTransactionRequest $request): JsonResponse
    {
        $transaction = $this->transactions->recordIncoming($request->validated(), $request->user());

        return TransactionResource::make($transaction)->response()->setStatusCode(201);
    }
}
