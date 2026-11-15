<?php

namespace App\Http\Controllers\Categories;

use App\Http\Controllers\Controller;
use App\Http\Requests\Categories\SaveCategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Services\CategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class CategoryController extends Controller
{
    public function __construct(private readonly CategoryService $categories) {}

    public function index(): AnonymousResourceCollection
    {
        return CategoryResource::collection($this->categories->list());
    }

    public function store(SaveCategoryRequest $request): JsonResponse
    {
        $category = $this->categories->create($request->validated('name'));

        return (new CategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(SaveCategoryRequest $request, Category $category): CategoryResource
    {
        return new CategoryResource($this->categories->update($category, $request->validated('name')));
    }

    public function destroy(Category $category): Response
    {
        $this->categories->delete($category);

        return response()->noContent();
    }
}
