<?php

namespace App\Services;

use App\Models\Manufacturer;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use LogicException;

/**
 * SHARED CONTRACT. resolve() was built with the shared foundation, so Developer A can use it in
 * Incoming from the start. Owner from now on: Developer B (search() and GET /manufacturers in
 * phase 2).
 * The signatures are agreed: change them only together. BACKEND_HANDOFF.md, "Barcodes and
 * manufacturers".
 */
class ManufacturerService
{
    /**
     * The manufacturer with this name, created if no existing one matches.
     *
     * - Names are matched by Manufacturer::normalize(): "PharmaCo", "pharmaco" and "Pharma Co."
     *   are one manufacturer, kept under the spelling first entered.
     * - $name has been validated by the caller's Form Request (required, string, max:150) and is
     *   trimmed here.
     * - Call it inside the caller's DB::transaction, so a rejected receipt (or barcode link)
     *   leaves no new manufacturer behind.
     *
     * Used by: POST /transactions/incoming, PUT /transactions/{transaction} (A),
     *          POST /inventory/{item}/barcodes (B).
     */
    public function resolve(string $name): Manufacturer
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name));
        $normalized = Manufacturer::normalize($name);

        // "..." or "-" passes "required" but has no letters or digits to compare by.
        if ($normalized === '') {
            throw ValidationException::withMessages([
                'manufacturer' => 'Enter a manufacturer name with letters or numbers.',
            ]);
        }

        // Finds the existing manufacturer, or creates it under this spelling. If two requests
        // create the same new name at once, the unique index on normalized_name stops the second
        // insert and firstOrCreate returns the row the first one saved.
        return Manufacturer::firstOrCreate(
            ['normalized_name' => $normalized],
            ['name' => $name],
        );
    }

    /**
     * GET /manufacturers?search=: every manufacturer whose name contains $search (all of them
     * when it is empty), alphabetical.
     *
     * @return Collection<int, Manufacturer>
     */
    public function search(?string $search): Collection
    {
        throw new LogicException('ManufacturerService::search() is not built yet (phase 2, Developer B).');
    }
}
