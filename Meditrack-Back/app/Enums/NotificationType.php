<?php

namespace App\Enums;

enum NotificationType: string
{
    case LowStock = 'low_stock';
    case OutOfStock = 'out_of_stock';
    // Per batch: the batch is expired or expiring soon (see ExpiryStatus).
    case Expiring = 'expiring';
}
