<?php

namespace App\Enums;

// The four reports (GET /reports/{type}). Open to both roles.
enum ReportType: string
{
    case Summary = 'summary';
    case MovementHistory = 'movement_history';
    case CriticalItems = 'critical_items';
    case InventoryValue = 'inventory_value';

    /**
     * Whether from / to apply. summary and critical_items show the inventory as it is today:
     * they ignore the period, and the export writes "As of today" for it.
     */
    public function usesPeriod(): bool
    {
        return $this === self::MovementHistory || $this === self::InventoryValue;
    }
}
