<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per successful edit of a transaction, saved in the same database transaction
        // as the edit. Only the fields that changed, with the request field names and raw values.
        Schema::create('transaction_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transaction_id')->constrained()->restrictOnDelete();
            $table->foreignId('edited_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('edited_at');
            $table->json('old_values');
            $table->json('new_values');

            $table->index(['transaction_id', 'edited_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaction_revisions');
    }
};
