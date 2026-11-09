<?php

namespace App\Enums;

// The units an item can be counted in. Must match UNITS in Meditrack-Front/src/constants/inventory.js.
enum Unit: string
{
    case Box = 'box';
    case Strip = 'strip';
    case Bottle = 'bottle';
    case Vial = 'vial';
    case Ampoule = 'ampoule';
    case Piece = 'piece';
    case Pack = 'pack';
}
