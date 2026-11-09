<?php

namespace App\Enums;

// An inactive user cannot sign in, and an existing token stops working. Users are never deleted.
enum UserStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
}
