<?php

namespace App\Enums;

enum NotificationType: string
{
    case LowStock = 'low_stock';
    case OutOfStock = 'out_of_stock';
    // Per batch: the batch is expired or expiring soon (see ExpiryStatus).
    case Expiring = 'expiring';
    // Per storekeeper account: 1-7 days left before account_expires_on.
    case AccountExpiring = 'account_expiring';
    // Per storekeeper account: today is account_expires_on, the last day it works.
    case AccountExpiresToday = 'account_expires_today';

    /** Account alerts are seen by the admin and the account's owner only. */
    public function isAccountAlert(): bool
    {
        return $this === self::AccountExpiring || $this === self::AccountExpiresToday;
    }
}
