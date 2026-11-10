<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            // App\Enums\TransactionType: incoming | outgoing.
            $table->string('type', 20);
            // App\Enums\OutgoingReason: issue | expired_disposal. null for incoming.
            $table->string('reason', 20)->nullable();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            // Incoming: the batch it received. Outgoing: the batch the stock left.
            $table->foreignId('batch_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('quantity');
            // Incoming: purchase price. Outgoing: the item's Average Cost when it was recorded
            // (a historical snapshot, never recalculated).
            $table->decimal('unit_cost', 12, 4);
            // Outgoing issues only.
            $table->string('recipient', 150)->nullable();
            // Business date chosen in the form. created_at is when it was saved and sets the
            // order in which the Average Cost is built up.
            $table->date('date');
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            // App\Enums\TransactionStatus: active | cancelled. Transactions are never deleted.
            $table->string('status', 20)->default('active');
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamps();

            // Stock replay reads an item's / a batch's active transactions in saved order.
            $table->index(['item_id', 'status']);
            $table->index(['batch_id', 'status']);
            $table->index('date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
