<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Archive history: one row per archiving, completed when the item is restored. Rows are
        // never changed after that or deleted. An item has at most one open row (restored_at null),
        // and items.archived_at mirrors it, written in the same database transaction.
        Schema::create('item_archivals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->string('reason', 500);
            $table->foreignId('archived_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('archived_at');
            $table->foreignId('restored_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('restored_at')->nullable();

            $table->index(['item_id', 'archived_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_archivals');
    }
};
