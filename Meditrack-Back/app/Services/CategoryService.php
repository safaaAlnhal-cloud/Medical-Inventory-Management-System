<?php

namespace App\Services;

use App\Exceptions\ConflictException;
use App\Models\Category;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;

/**
 * Item categories: BACKEND_HANDOFF.md section 4.3.
 */
class CategoryService
{
    /** Every category, oldest first. */
    public function list(): Collection
    {
        return Category::query()->orderBy('id')->get();
    }

    /** 409 on "name" when another category already has the name, whatever its case. */
    public function create(string $name): Category
    {
        $this->ensureNameIsFree($name);

        return Category::create(['name' => $name]);
    }

    public function update(Category $category, string $name): Category
    {
        $this->ensureNameIsFree($name, $category);
        $category->update(['name' => $name]);

        return $category;
    }

    /**
     * A category is deleted only when no item uses it. Archived items count too: they keep their
     * category for reports and for being restored.
     */
    public function delete(Category $category): void
    {
        if ($category->items()->active()->exists()) {
            throw new ConflictException('Cannot delete this category because it is currently in use by inventory items.');
        }
        if ($category->items()->exists()) {
            throw new ConflictException('Cannot delete this category because deactivated items still belong to it.');
        }

        $category->delete();
    }

    private function ensureNameIsFree(string $name, ?Category $except = null): void
    {
        $taken = Category::query()
            ->whereRaw('LOWER(name) = ?', [Str::lower($name)])
            ->when($except !== null, fn (Builder $query) => $query->whereKeyNot($except->id))
            ->exists();

        if ($taken) {
            throw ConflictException::on('name', 'A category with this name already exists.');
        }
    }
}
