<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Export log: one row per export file that was produced successfully. Written once,
        // never changed. There is no page to read it yet.
        Schema::create('report_exports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            // summary | movement_history | critical_items | inventory_value
            $table->string('report_type', 30);
            // App\Enums\ExportFormat: pdf | xlsx | csv
            $table->string('format', 10);
            // The filters exactly as sent (ids, not names).
            $table->json('filters');
            // The report period; null for the reports that show today's inventory.
            $table->date('period_from')->nullable();
            $table->date('period_to')->nullable();
            $table->unsignedInteger('row_count');
            // Server time (Asia/Gaza).
            $table->timestamp('exported_at');

            $table->index(['user_id', 'exported_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_exports');
    }
};
