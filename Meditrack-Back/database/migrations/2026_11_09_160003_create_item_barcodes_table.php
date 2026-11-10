<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Factory barcodes. One item can have several (one per manufacturer, or more); each says
        // "this item, made by this manufacturer". Every barcode of an item stands for the same
        // pack size: a different pack size is a different item.
        Schema::create('item_barcodes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->foreignId('manufacturer_id')->constrained()->restrictOnDelete();
            // Unique in the whole system, archived items included.
            $table->string('barcode', 64)->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_barcodes');
    }
};
