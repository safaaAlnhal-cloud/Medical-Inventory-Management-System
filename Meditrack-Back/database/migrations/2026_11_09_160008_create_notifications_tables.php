<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per alert condition that currently exists (low stock, out of stock, an expiring
        // or expired batch, a storekeeper account about to expire). The row is added when the
        // condition first appears and removed when it is resolved; if the condition comes back it
        // is a new, unread alert (as in the mock).
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            // "<type>-<itemId, batchId or userId>", e.g. "low_stock-4", "expiring-9",
            // "account_expiring-3". Returned as the alert's id and guarantees one alert per
            // condition.
            $table->string('key', 50)->unique();
            // App\Enums\NotificationType.
            $table->string('type', 30);
            // Stock and expiry alerts: the item (and the batch for expiry alerts).
            $table->foreignId('item_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->restrictOnDelete();
            // Account alerts: the storekeeper whose account expires. Seen by the admin and by
            // that storekeeper only.
            $table->foreignId('user_id')->nullable()->constrained()->restrictOnDelete();
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
