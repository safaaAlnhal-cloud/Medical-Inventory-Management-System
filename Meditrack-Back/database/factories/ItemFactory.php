<?php

namespace Database\Factories;

use App\Enums\Unit;
use App\Models\Category;
use App\Models\Item;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A new item with no stock. Stock is added in tests by recording incoming transactions
 * through StockService, never by writing quantities directly.
 *
 * @extends Factory<Item>
 */
class ItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'category_id' => Category::factory(),
            'name' => fake()->unique()->words(2, true),
            'unit' => fake()->randomElement(Unit::cases()),
            'min_qty' => fake()->numberBetween(5, 50),
        ];
    }

    public function archived(): static
    {
        return $this->state(fn () => ['archived_at' => now()]);
    }
}
