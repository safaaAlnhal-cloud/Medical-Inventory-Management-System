<?php

namespace Tests\Feature\Categories;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET, POST, PUT and DELETE /api/categories: BACKEND_HANDOFF.md section 4.3. */
class CategoriesTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_signed_in_user_gets_the_categories_oldest_first(): void
    {
        $medications = Category::create(['name' => 'Medications']);
        $supplies = Category::create(['name' => 'Supplies']);

        $this->actingAsStorekeeper()
            ->getJson('/api/categories')
            ->assertOk()
            ->assertExactJson([
                ['id' => $medications->id, 'name' => 'Medications'],
                ['id' => $supplies->id, 'name' => 'Supplies'],
            ]);
    }

    public function test_the_admin_creates_a_category_with_a_trimmed_name(): void
    {
        $this->actingAsAdmin()
            ->postJson('/api/categories', ['name' => '  Lab Tests '])
            ->assertCreated()
            ->assertJson(['name' => 'Lab Tests']);

        $this->assertDatabaseHas('categories', ['name' => 'Lab Tests']);
    }

    public function test_a_name_already_in_use_is_a_409_whatever_its_case(): void
    {
        Category::create(['name' => 'Medications']);

        $this->actingAsAdmin()
            ->postJson('/api/categories', ['name' => 'MEDICATIONS'])
            ->assertConflict()
            ->assertJsonPath('errors.name', 'A category with this name already exists.');
    }

    public function test_a_missing_or_too_long_name_is_a_422(): void
    {
        $this->actingAsAdmin();

        $this->postJson('/api/categories', ['name' => '   '])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name', 'Category name is required.');
        $this->postJson('/api/categories', ['name' => str_repeat('a', 101)])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name', 'Category name may not be longer than 100 characters.');
    }

    public function test_the_admin_renames_a_category_and_may_keep_or_recase_its_own_name(): void
    {
        $category = Category::create(['name' => 'Medications']);
        Category::create(['name' => 'Supplies']);
        $this->actingAsAdmin();

        $this->putJson("/api/categories/{$category->id}", ['name' => 'medications'])->assertOk()->assertJson(['name' => 'medications']);
        $this->putJson("/api/categories/{$category->id}", ['name' => 'supplies'])->assertConflict();
        $this->putJson('/api/categories/999', ['name' => 'X'])->assertNotFound();
    }

    public function test_an_unused_category_is_deleted(): void
    {
        $category = Category::create(['name' => 'Empty']);

        $this->actingAsAdmin()->deleteJson("/api/categories/{$category->id}")->assertNoContent();

        $this->assertModelMissing($category);
    }

    public function test_a_category_used_by_an_active_or_an_archived_item_is_not_deleted(): void
    {
        $active = Category::create(['name' => 'Used']);
        Item::factory()->create(['category_id' => $active->id]);
        $archived = Category::create(['name' => 'Archived only']);
        Item::factory()->archived()->create(['category_id' => $archived->id]);
        $this->actingAsAdmin();

        $this->deleteJson("/api/categories/{$active->id}")
            ->assertConflict()
            ->assertJsonPath('message', 'Cannot delete this category because it is currently in use by inventory items.');
        $this->deleteJson("/api/categories/{$archived->id}")
            ->assertConflict()
            ->assertJsonPath('message', 'Cannot delete this category because deactivated items still belong to it.');
    }

    public function test_a_storekeeper_can_only_read(): void
    {
        $category = Category::create(['name' => 'Medications']);
        $this->actingAsStorekeeper();

        $this->postJson('/api/categories', ['name' => 'X'])->assertForbidden();
        $this->putJson("/api/categories/{$category->id}", ['name' => 'X'])->assertForbidden();
        $this->deleteJson("/api/categories/{$category->id}")->assertForbidden();
    }

    public function test_a_signed_out_request_is_a_401(): void
    {
        $this->getJson('/api/categories')->assertUnauthorized();
    }
}
