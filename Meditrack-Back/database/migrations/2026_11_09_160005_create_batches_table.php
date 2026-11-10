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
            // The same item can be received from different manufacturers; null = unknown.
            $table->foreignId('manufacturer_id')->nullable()->constrained()->restrictOnDelete();
            // Printed by the manufacturer. Unique per item + manufacturer among batches whose
            // incoming transaction is active (no manufacturer = one group of its own). Checked in
            // the application, because a unique index cannot express "active only".
            $table->string('batch_number', 100);
            // Purchase price, supplier and dates the batch was received with.
            $table->decimal('unit_cost', 12, 4);
            // Optional: donations have no commercial supplier.
            $table->string('supplier', 150)->nullable();
            $table->date('manufacturing_date')->nullable();
            // null = the supply does not expire: never "expired" or "expiring soon", no alerts.
            $table->date('expiry_date')->nullable();
            // Cached physical stock (received - issued - disposed), expired stock included.
            // Recalculated by StockService from the active transactions; never edited directly.
            $table->unsignedInteger('quantity')->default(0);
            $table->timestamps();

            $table->index(['item_id', 'manufacturer_id', 'batch_number']);
            $table->index('expiry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batches');
    }
};
