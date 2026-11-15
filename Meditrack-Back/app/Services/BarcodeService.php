<?php

namespace App\Services;

use App\Exceptions\ConflictException;
use App\Models\Item;
use App\Models\ItemBarcode;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Factory barcodes: BACKEND_HANDOFF.md "Barcodes and manufacturers" and section 4.4.
 * A barcode is unique in the whole system (archived items included) and says "this item, made by
 * this manufacturer". The barcodes of an archived item cannot be added or removed.
 */
class BarcodeService
{
    public const ARCHIVED = 'This item is deactivated. Reactivate it before changing its barcodes.';

    public function __construct(
        private readonly ItemService $items,
        private readonly ManufacturerService $manufacturers,
        private readonly StockService $stock,
    ) {}

    /** The barcode, with its item, compared exactly. 404 when no item has it. */
    public function find(string $code): ItemBarcode
    {
        $barcode = ItemBarcode::with('item')->where('barcode', $code)->first();
        if ($barcode === null) {
            throw new NotFoundHttpException;
        }

        return $barcode;
    }

    /**
     * Links a barcode to the item, with its manufacturer (created if the name is new).
     * 409 when the item is archived, and on "barcode" when any item already has it.
     */
    public function link(Item $item, string $code, string $manufacturerName): Item
    {
        return DB::transaction(function () use ($item, $code, $manufacturerName) {
            // Nobody archives the item while we add to it.
            $item = $this->stock->lockItems($item->id)->first();
            if ($item->isArchived()) {
                throw new ConflictException(self::ARCHIVED);
            }
            $this->ensureBarcodeIsFree($code);

            // Inside the transaction: if the link fails, no new manufacturer is left behind.
            $manufacturer = $this->manufacturers->resolve($manufacturerName);
            try {
                $item->barcodes()->create(['barcode' => $code, 'manufacturer_id' => $manufacturer->id]);
            } catch (UniqueConstraintViolationException) {
                // Someone linked the same barcode a moment ago: the unique index stopped this one.
                throw $this->taken();
            }

            return $this->items->load($item);
        });
    }

    /** Removes one of the item's barcodes. 409 when the item is archived. */
    public function unlink(Item $item, ItemBarcode $barcode): Item
    {
        return DB::transaction(function () use ($item, $barcode) {
            $item = $this->stock->lockItems($item->id)->first();
            if ($item->isArchived()) {
                throw new ConflictException(self::ARCHIVED);
            }
            $barcode->delete();

            return $this->items->load($item);
        });
    }

    private function ensureBarcodeIsFree(string $code): void
    {
        $owner = ItemBarcode::with('item')->where('barcode', $code)->first();
        if ($owner !== null) {
            throw $this->taken($owner->item);
        }
    }

    private function taken(?Item $owner = null): ConflictException
    {
        $message = $owner === null
            ? 'This barcode is already linked to an item.'
            : "This barcode is already linked to \"{$owner->name}\".";

        return ConflictException::on('barcode', $message);
    }
}
