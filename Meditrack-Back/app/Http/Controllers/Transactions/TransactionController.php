<?php

namespace App\Http\Controllers\Transactions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Transactions\UpdateTransactionRequest;
use App\Http\Resources\BatchOptionResource;
use App\Http\Resources\TransactionResource;
use App\Http\Resources\TransactionRevisionResource;
use App\Models\Item;
use App\Models\Transaction;
use App\Services\TransactionService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Corrections to an existing transaction of any type (incoming, outgoing or disposal):
 * BACKEND_HANDOFF.md section 4.5. Any signed-in user may make them (decision 5).
 */
class TransactionController extends Controller
{
    public function __construct(private readonly TransactionService $transactions) {}

    /**
     * GET /transactions/{transaction}/batch-options?itemId=&manufacturerId=: the batch list of
     * the edit form. An unknown itemId has no batches: [].
     */
    public function batchOptions(Request $request, Transaction $transaction): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'itemId' => ['required', 'integer'],
            'manufacturerId' => ['nullable', 'integer'],
        ], [
            'itemId.*' => 'Choose an item from the list.',
            'manufacturerId.integer' => 'Choose a manufacturer from the list.',
        ]);

        $item = Item::find($validated['itemId']);
        $manufacturerId = isset($validated['manufacturerId']) ? (int) $validated['manufacturerId'] : null;

        return BatchOptionResource::collection(
            $item === null ? [] : $this->transactions->batchOptionsForEdit($transaction, $item, $manufacturerId),
        );
    }

    /** PUT /transactions/{transaction}: who edited it comes from the token. */
    public function update(UpdateTransactionRequest $request, Transaction $transaction): TransactionResource
    {
        return TransactionResource::make($this->transactions->update($transaction, $request->validated(), $request->user()));
    }

    /** GET /transactions/{transaction}/revisions: the edit history, newest first; [] if never edited. */
    public function revisions(Transaction $transaction): AnonymousResourceCollection
    {
        return TransactionRevisionResource::collection($this->transactions->revisions($transaction));
    }

    /** PATCH /transactions/{transaction}/cancel: no body; who cancelled it comes from the token. */
    public function cancel(Request $request, Transaction $transaction): TransactionResource
    {
        return TransactionResource::make($this->transactions->cancel($transaction, $request->user()));
    }
}
