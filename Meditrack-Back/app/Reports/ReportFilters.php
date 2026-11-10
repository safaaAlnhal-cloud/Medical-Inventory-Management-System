<?php

namespace App\Reports;

use Carbon\CarbonImmutable;

/**
 * SHARED CONTRACT between GET /reports/{type} (Developer A) and its export (Developer B).
 * The filters of a report, as the request sent them (ids, not names). BACKEND_HANDOFF.md 4.8.
 */
final readonly class ReportFilters
{
    public function __construct(
        public ?CarbonImmutable $from = null,
        public ?CarbonImmutable $to = null,
        public ?int $categoryId = null,
        public ?int $itemId = null,
        public ?string $search = null,
    ) {}

    /** From validated query parameters: from, to, categoryId, itemId, search. */
    public static function fromArray(array $query): self
    {
        $date = fn (?string $value) => $value ? CarbonImmutable::parse($value)->startOfDay() : null;

        return new self(
            from: $date($query['from'] ?? null),
            to: $date($query['to'] ?? null),
            categoryId: isset($query['categoryId']) ? (int) $query['categoryId'] : null,
            itemId: isset($query['itemId']) ? (int) $query['itemId'] : null,
            search: filled($query['search'] ?? null) ? trim($query['search']) : null,
        );
    }

    /** As stored in report_exports.filters: what was sent, with no empty values. */
    public function toArray(): array
    {
        return array_filter([
            'from' => $this->from?->toDateString(),
            'to' => $this->to?->toDateString(),
            'categoryId' => $this->categoryId,
            'itemId' => $this->itemId,
            'search' => $this->search,
        ], fn ($value) => $value !== null);
    }
}
