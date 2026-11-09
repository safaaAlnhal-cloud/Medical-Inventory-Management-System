<?php

namespace App\Enums;

// Derived from an item's available quantity and minQty; never stored.
enum StockStatus: string
{
    case Available = 'available';
    case LowStock = 'low_stock';
    case OutOfStock = 'out_of_stock';
}
