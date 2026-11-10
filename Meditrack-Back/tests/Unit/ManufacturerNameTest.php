<?php

namespace Tests\Unit;

use App\Models\Manufacturer;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

// A unit test: pure PHP, no database and no Laravel app, so it runs in milliseconds.
class ManufacturerNameTest extends TestCase
{
    #[DataProvider('spellings')]
    public function test_spellings_of_the_same_company_normalize_to_the_same_value(string $name): void
    {
        $this->assertSame('novapharma', Manufacturer::normalize($name));
    }

    public static function spellings(): array
    {
        return [
            ['Nova Pharma'], ['nova pharma'], ['NOVA-PHARMA'], ['Nova  Pharma.'], [' novapharma '],
        ];
    }

    public function test_arabic_letters_and_digits_are_kept(): void
    {
        $this->assertSame('شركةالدواء3', Manufacturer::normalize('شركة الدواء - 3'));
    }
}
