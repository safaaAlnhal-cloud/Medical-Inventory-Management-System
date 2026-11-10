<?php

namespace Tests\Feature\Manufacturers;

use App\Models\Manufacturer;
use App\Services\ManufacturerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Tests\TestCase;

class ResolveManufacturerTest extends TestCase
{
    use RefreshDatabase;

    private ManufacturerService $manufacturers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manufacturers = app(ManufacturerService::class);
    }

    public function test_a_new_name_creates_a_manufacturer(): void
    {
        $manufacturer = $this->manufacturers->resolve('  Nova   Pharma ');

        $this->assertSame('Nova Pharma', $manufacturer->name, 'trimmed, inner spaces collapsed');
        $this->assertSame('novapharma', $manufacturer->normalized_name);
        $this->assertSame(1, Manufacturer::count());
    }

    public function test_other_spellings_find_the_same_manufacturer_and_keep_the_first_spelling(): void
    {
        $first = $this->manufacturers->resolve('Pharma Co.');

        foreach (['PharmaCo', 'pharmaco', 'PHARMA-CO', 'Pharma, Co'] as $spelling) {
            $this->assertTrue($first->is($this->manufacturers->resolve($spelling)), $spelling);
        }
        $this->assertSame(1, Manufacturer::count());
        $this->assertSame('Pharma Co.', $first->fresh()->name);
    }

    public function test_a_name_without_letters_or_digits_is_a_422_on_the_manufacturer_field(): void
    {
        try {
            $this->manufacturers->resolve('...');
            $this->fail('Expected a validation error');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('manufacturer', $e->errors());
        }
        $this->assertSame(0, Manufacturer::count());
    }

    public function test_a_rejected_receipt_leaves_no_new_manufacturer_behind(): void
    {
        try {
            DB::transaction(function () {
                $this->manufacturers->resolve('Brand New Labs');
                throw new RuntimeException('the receipt was rejected after the manufacturer was resolved');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame(0, Manufacturer::count());
    }
}
