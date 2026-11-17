<?php

namespace App\Http\Controllers\Transactions;

use App\Http\Controllers\Controller;
use App\Http\Resources\TransactionResource;
use App\Models\Transaction;
use App\Services\TransactionService;
use Illuminate\Http\Request;

/**
 * Corrections to an existing transaction of any type (incoming, outgoing or disposal):
 * BACKEND_HANDOFF.md section 4.5. Any signed-in user may make them (decision 5).
 */
class TransactionController extends Controller
{
    public function __construct(private readonly TransactionService $transactions) {}

    /** PATCH /transactions/{transaction}/cancel: no body; who cancelled it comes from the token. */
    public function cancel(Request $request, Transaction $transaction): TransactionResource
    {
        return TransactionResource::make($this->transactions->cancel($transaction, $request->user()));
    }
}
