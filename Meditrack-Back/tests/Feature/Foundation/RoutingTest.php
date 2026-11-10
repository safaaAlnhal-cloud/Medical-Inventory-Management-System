<?php

namespace Tests\Feature\Foundation;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RoutingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['api', 'auth:sanctum', 'role:admin'])->get('/api/_test/admin-only', fn () => ['ok' => true]);
        Route::middleware('api')->get('/api/_test/items/{item}', fn (string $item) => ['matched' => 'id']);
        Route::middleware('api')->get('/api/_test/items/archived', fn () => ['matched' => 'archived']);
    }

    public function test_an_admin_only_route_lets_the_admin_through(): void
    {
        $this->actingAsAdmin()->getJson('/api/_test/admin-only')->assertOk();
    }

    public function test_an_admin_only_route_refuses_a_storekeeper_with_403(): void
    {
        $this->actingAsStorekeeper()->getJson('/api/_test/admin-only')
            ->assertStatus(403)
            ->assertExactJson(['message' => 'You do not have permission to perform this action.']);
    }

    public function test_id_parameters_only_match_numbers(): void
    {
        // {item} is defined first, but "archived" is not a number, so it reaches the second route.
        $this->getJson('/api/_test/items/archived')->assertJson(['matched' => 'archived']);
        $this->getJson('/api/_test/items/7')->assertJson(['matched' => 'id']);
    }

    public function test_every_module_route_file_loads(): void
    {
        $this->artisan('route:list', ['--path' => 'api'])->assertSuccessful();
    }
}
