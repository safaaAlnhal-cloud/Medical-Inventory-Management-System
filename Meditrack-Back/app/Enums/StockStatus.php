<?php

namespace App\Enums;

// Derived from an item's available quantity and minQty; never stored.
enum StockStatus: string
{
    case Available = 'available';
    case LowStock = 'low_stock';
    case OutOfStock = 'out_of_stock';

    /**
     * The rule in BACKEND_HANDOFF.md, "Stock and expiry rules" (and src/utils/stock.js):
     * out_of_stock at 0 or less, low_stock up to minQty, available above it.
     * $quantity is the AVAILABLE stock: expired stock does not count.
     */
    public static function of(int $quantity, int $minQty): self
    {
        return match (true) {
            $quantity <= 0 => self::OutOfStock,
            $quantity <= $minQty => self::LowStock,
            default => self::Available,
        };
    }
}
