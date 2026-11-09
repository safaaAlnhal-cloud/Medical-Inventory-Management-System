<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per alert condition that currently exists (low stock, out of stock, an expiring
        // or expired batch). The row is added when the condition first appears and removed when it
        // is resolved; if the condition comes back it is a new, unread alert (as in the mock).
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            // "<type>-<itemId or batchId>", e.g. "low_stock-4", "expiring-9". Returned as the
            // alert's id and guarantees one alert per condition.
            $table->string('key', 50)->unique();
            // App\Enums\NotificationType: low_stock | out_of_stock | expiring.
            $table->string('type', 20);
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->restrictOnDelete();
            // Returned as createdAt: when the condition was first seen.
            $table->timestamp('first_seen_at');
        });

        // Read state is per user. Removing a resolved alert removes its read marks with it.
        Schema::create('notification_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('notification_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->timestamp('read_at');

            $table->unique(['notification_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_reads');
        Schema::dropIfExists('notifications');
    }
};
