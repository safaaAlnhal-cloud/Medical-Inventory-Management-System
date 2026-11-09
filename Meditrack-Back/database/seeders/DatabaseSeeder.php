<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * php artisan migrate:fresh --seed
     *
     * AdminSeeder creates the one admin account; the system cannot work without it.
     * DemoDataSeeder adds the frontend's mock data (storekeepers, items, batches,
     * transactions) for development and the demo. Leave it out on a real installation:
     *   php artisan db:seed --class=AdminSeeder
     */
    public function run(): void
    {
        $this->call([
            AdminSeeder::class,
            DemoDataSeeder::class,
        ]);
    }
}
