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
            // Cached moving average. Recalculated by StockService from the active transactions.
            $table->decimal('avg_unit_cost', 12, 4)->default(0);
            // "Deactivated" in the UI. Items are never deleted.
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('items');
    }
};
