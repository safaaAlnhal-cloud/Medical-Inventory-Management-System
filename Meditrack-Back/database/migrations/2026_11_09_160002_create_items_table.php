<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('items', function (Blueprint $table) {
            $table->id();
            // A category that still has items (active or archived) cannot be deleted.
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            // Unique among active items only (a name can be reused after archiving),
            // so the rule is checked in the application, not by a unique index.
            $table->string('name', 150)->index();
            $table->string('unit', 20);
            $table->unsignedInteger('min_qty');
            // Optional details, the same for every box of the item. All optional, because the
            // inventory also holds supplies (gloves, cotton), not only medicines. The manufacturer,
            // manufacturing date and expiry date are on the batch, never here.
            $table->string('active_ingredient', 150)->nullable();
            $table->string('strength', 50)->nullable();
            $table->string('dosage_form', 50)->nullable();
            $table->string('storage_conditions', 255)->nullable();
            $table->text('uses')->nullable();
            $table->text('description')->nullable();
            // Cached moving average. Recalculated by StockService from the active transactions.
            $table->decimal('avg_unit_cost', 12, 4)->default(0);
            // "Deactivated" in the UI. Items are never deleted. The current state only: who archived
            // it, why, and every earlier archiving are in item_archivals, written in the same
            // database transaction.
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('items');
    }
};
