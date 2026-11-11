<?php

namespace Tests\Feature\Manufacturers;

use App\Models\Manufacturer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /api/manufacturers?search=: BACKEND_HANDOFF.md section 4.4. */
class ListManufacturersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Nova Pharma', 'Medica Labs', 'SafeCare Industries'] as $name) {
            Manufacturer::factory()->create(['name' => $name, 'normalized_name' => Manufacturer::normalize($name)]);
        }
    }

    public function test_a_signed_out_request_is_a_401(): void
    {
        $this->getJson('/api/manufacturers')->assertUnauthorized();
    }

    public function test_without_search_every_manufacturer_is_listed_alphabetically_as_id_and_name(): void
    {
        $this->actingAsStorekeeper()
            ->getJson('/api/manufacturers')
            ->assertOk()
            ->assertExactJson([
                ['id' => Manufacturer::where('name', 'Medica Labs')->value('id'), 'name' => 'Medica Labs'],
                ['id' => Manufacturer::where('name', 'Nova Pharma')->value('id'), 'name' => 'Nova Pharma'],
                ['id' => Manufacturer::where('name', 'SafeCare Industries')->value('id'), 'name' => 'SafeCare Industries'],
            ]);
    }

    public function test_search_keeps_the_names_that_contain_the_text_whatever_its_case_and_spaces(): void
    {
        $this->actingAsAdmin()
            ->getJson('/api/manufacturers?search='.urlencode('  CARE '))
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'SafeCare Industries');
    }

    public function test_a_search_that_matches_nothing_is_an_empty_list(): void
    {
        $this->actingAsStorekeeper()
            ->getJson('/api/manufacturers?search=xyz')
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_a_search_that_is_not_text_is_a_422_on_the_search_field(): void
    {
        $this->actingAsStorekeeper()
            ->getJson('/api/manufacturers?search[]=x')
            ->assertUnprocessable()
            ->assertJsonPath('errors.search', 'The search must be text.');
    }

    public function test_a_search_longer_than_a_manufacturer_name_is_a_422(): void
    {
        $this->actingAsStorekeeper()
            ->getJson('/api/manufacturers?search='.str_repeat('a', 151))
            ->assertUnprocessable()
            ->assertJsonPath('errors.search', 'The search may not be longer than 150 characters.');
    }
}
