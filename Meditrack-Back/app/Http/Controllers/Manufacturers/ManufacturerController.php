<?php

namespace App\Http\Controllers\Manufacturers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Manufacturers\SearchManufacturersRequest;
use App\Http\Resources\ManufacturerResource;
use App\Services\ManufacturerService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ManufacturerController extends Controller
{
    public function __construct(private readonly ManufacturerService $manufacturers) {}

    public function index(SearchManufacturersRequest $request): AnonymousResourceCollection
    {
        $manufacturers = $this->manufacturers->search($request->validated('search'));

        return ManufacturerResource::collection($manufacturers);
    }
}
