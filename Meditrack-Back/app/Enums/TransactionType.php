<?php

namespace App\Enums;

enum TransactionType: string
{
    case Incoming = 'incoming';
    case Outgoing = 'outgoing';
}
