<?php

namespace App\Enums;

// A cancelled transaction is kept as a record but no longer counts towards stock or costs.
enum TransactionStatus: string
{
    case Active = 'active';
    case Cancelled = 'cancelled';
}
