<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Sanctum\Sanctum;

/**
 * Base class for every test. Tests run on an in-memory SQLite database (phpunit.xml), never on
 * the MySQL database the app uses. A test class that touches the database adds:
 *
 *     use RefreshDatabase;
 *
 * which runs the migrations once and rolls each test back, so tests never see each other's data.
 */
abstract class TestCase extends BaseTestCase
{
    /** Sends the next requests as a logged-in admin: $this->actingAsAdmin()->getJson('/api/...') */
    protected function actingAsAdmin(?User $user = null): static
    {
        Sanctum::actingAs($user ?? User::factory()->admin()->create());

        return $this;
    }

    /** Sends the next requests as a logged-in storekeeper. */
    protected function actingAsStorekeeper(?User $user = null): static
    {
        Sanctum::actingAs($user ?? User::factory()->create());

        return $this;
    }
}
