<?php

namespace App\Http\Controllers\Transactions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Transactions\StoreDisposalTransactionRequest;
use App\Http\Resources\TransactionResource;
use App\Services\TransactionService;
use Illuminate\Http\JsonResponse;

/**
 * POST /transactions/disposal. There is no list of its own: disposals are outgoing
 * transactions and GET /transactions/outgoing lists them with the issues.
 */
class DisposalTransactionController extends Controller
{
    public function __construct(private readonly TransactionService $transactions) {}

    public function store(StoreDisposalTransactionRequest $request): JsonResponse
    {
        $transaction = $this->transactions->recordDisposal($request->validated(), $request->user());

        return TransactionResource::make($transaction)->response()->setStatusCode(201);
    }
}
