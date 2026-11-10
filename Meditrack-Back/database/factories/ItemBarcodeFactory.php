<?php

namespace Database\Factories;

use App\Models\Item;
use App\Models\ItemBarcode;
use App\Models\Manufacturer;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ItemBarcode>
 */
class ItemBarcodeFactory extends Factory
{
    public function definition(): array
    {
        return [
            'item_id' => Item::factory(),
            'manufacturer_id' => Manufacturer::factory(),
            'barcode' => fake()->unique()->ean13(),
        ];
    }
}
