<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            // Unique per item among batches whose incoming transaction is active, so the rule is
            // checked in the application (a cancelled receipt frees its number).
            $table->string('batch_number', 100);
            // Purchase price, supplier and expiry the batch was received with.
            $table->decimal('unit_cost', 12, 4);
            $table->string('supplier', 150);
            // null = the supply does not expire: never "expired" or "expiring soon", no alerts.
            $table->date('expiry_date')->nullable();
            // Cached physical stock (received - issued - disposed), expired stock included.
            // Recalculated by StockService from the active transactions; never edited directly.
            $table->unsignedInteger('quantity')->default(0);
            $table->timestamps();

            $table->index(['item_id', 'batch_number']);
            $table->index('expiry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batches');
    }
};
