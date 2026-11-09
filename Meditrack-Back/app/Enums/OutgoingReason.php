<?php

namespace App\Enums;

// Why stock left. Incoming transactions have no reason (null).
enum OutgoingReason: string
{
    // Usable stock given to a recipient.
    case Issue = 'issue';
    // Expired stock removed from its batch; no recipient.
    case ExpiredDisposal = 'expired_disposal';
}
