<?php

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // The frontend expects the resource itself as the response body, not { "data": ... }.
        JsonResource::withoutWrapping();

        // Route parameters with these names only match numbers, so /inventory/archived never
        // reaches a route written as /inventory/{item}, whatever order the routes are defined in.
        foreach (['item', 'batch', 'transaction', 'category', 'user', 'notification', 'barcode', 'manufacturer'] as $name) {
            Route::pattern($name, '[0-9]+');
        }
    }
}
