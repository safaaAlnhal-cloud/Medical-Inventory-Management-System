<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Companies that make the products. Created from the Incoming form (and when a barcode is
        // linked), never on a page of their own. Never deleted: batches and barcodes point at them.
        Schema::create('manufacturers', function (Blueprint $table) {
            $table->id();
            // Shown to users, in the spelling first entered.
            $table->string('name', 150);
            // Lowercase, with spaces and punctuation removed: "Pharma Co." and "pharmaco" are the
            // same manufacturer. Unique, so a different spelling can never create a duplicate.
            $table->string('normalized_name', 150)->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manufacturers');
    }
};
