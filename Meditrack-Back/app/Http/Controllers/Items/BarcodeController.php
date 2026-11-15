<?php

namespace App\Http\Controllers\Items;

use App\Http\Controllers\Controller;
use App\Http\Requests\Items\LinkBarcodeRequest;
use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Models\ItemBarcode;
use App\Services\BarcodeService;
use Illuminate\Http\JsonResponse;

class BarcodeController extends Controller
{
    public function __construct(private readonly BarcodeService $barcodes) {}

    /** { item: { id, name, unit, archived }, manufacturerId, barcode } */
    public function show(string $code): JsonResponse
    {
        $barcode = $this->barcodes->find($code);

        return response()->json([
            'item' => [
                'id' => $barcode->item->id,
                'name' => $barcode->item->name,
                'unit' => $barcode->item->unit->value,
                'archived' => $barcode->item->isArchived(),
            ],
            'manufacturerId' => $barcode->manufacturer_id,
            'barcode' => $barcode->barcode,
        ]);
    }

    public function store(LinkBarcodeRequest $request, Item $item): JsonResponse
    {
        $item = $this->barcodes->link($item, $request->validated('barcode'), $request->validated('manufacturer'));

        return (new ItemResource($item))->response()->setStatusCode(201);
    }

    public function destroy(Item $item, ItemBarcode $barcode): ItemResource
    {
        return new ItemResource($this->barcodes->unlink($item, $barcode));
    }
}
