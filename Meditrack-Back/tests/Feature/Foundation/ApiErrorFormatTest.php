<?php

namespace Tests\Feature\Foundation;

use App\Exceptions\ConflictException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** Every API error has the body the frontend expects (BACKEND_HANDOFF.md, "Error format"). */
class ApiErrorFormatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Routes that exist only inside these tests, to trigger each kind of error.
        Route::post('/api/_test/validate', fn (Request $r) => $r->validate([
            'name' => ['required', 'min:3'],
            'email' => ['required', 'email'],
        ]));
        Route::get('/api/_test/conflict', fn () => throw ConflictException::on('email', 'Another account already uses this email address.'));
        Route::get('/api/_test/forbidden', fn () => abort(403));
    }

    public function test_401_without_a_token(): void
    {
        $this->getJson('/api/user')
            ->assertStatus(401)
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    public function test_a_valid_token_reaches_the_route(): void
    {
        $this->actingAsStorekeeper()->getJson('/api/user')->assertOk()->assertJsonStructure(['id', 'email', 'role']);
    }

    public function test_422_has_one_message_per_field(): void
    {
        $this->postJson('/api/_test/validate', ['name' => 'ab'])
            ->assertStatus(422)
            ->assertJsonPath('errors.name', fn ($v) => is_string($v))
            ->assertJsonPath('errors.email', fn ($v) => is_string($v))
            ->assertJsonPath('message', fn ($v) => is_string($v) && $v !== '');
    }

    public function test_409_names_the_conflicting_field(): void
    {
        $this->getJson('/api/_test/conflict')
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Another account already uses this email address.',
                'errors' => ['email' => 'Another account already uses this email address.'],
            ]);
    }

    public function test_403_and_404_have_clean_messages_without_a_trace(): void
    {
        $this->getJson('/api/_test/forbidden')
            ->assertStatus(403)
            ->assertExactJson(['message' => 'You do not have permission to perform this action.']);

        $this->getJson('/api/does-not-exist')
            ->assertStatus(404)
            ->assertExactJson(['message' => 'The requested record was not found.']);
    }
}
