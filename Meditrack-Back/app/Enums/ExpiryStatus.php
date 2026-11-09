<?php

namespace App\Enums;

// Derived from a batch's expiry date and today's date; never stored. A batch with no expiry
// date, or one more than 30 days away, has no expiry status (null).
enum ExpiryStatus: string
{
    case Expired = 'expired';
    case ExpiringSoon = 'expiring_soon';
}
