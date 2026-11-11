<?php

namespace Tests\Feature\Transactions;

use App\Enums\TransactionStatus;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Manufacturer;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** POST and GET /transactions/incoming: BACKEND_HANDOFF.md section 4.5. */
class IncomingTransactionTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-11 10:00');
        $this->item = Item::factory()->create(['name' => 'Saline Solution']);
        $this->user = User::factory()->create(['name' => 'Omar Saleh']);
        $this->actingAsStorekeeper($this->user);
    }

    // -- recording -------------------------------------------------------------------------

    public function test_a_receipt_creates_a_batch_and_updates_the_stock_and_average(): void
    {
        $this->receive(['quantity' => 10, 'unitCost' => 5]);

        $response = $this->receive([
            'quantity' => 20, 'unitCost' => 8, 'batchNumber' => 'SS-402', 'supplier' => 'BioLab',
            'manufacturer' => 'BioLab Pharma', 'manufacturingDate' => '2026-08-15', 'expiryDate' => '2027-03-01',
        ])->assertCreated();

        $batch = Batch::findOrFail($response->json('batchId'));
        $response->assertExactJson([
            'id' => $response->json('id'), 'type' => 'incoming', 'itemId' => $this->item->id,
            'batchId' => $batch->id, 'quantity' => 20, 'date' => '2026-11-10',
            'createdAt' => $response->json('createdAt'), 'recordedBy' => $this->user->id, 'unitCost' => 8,
            'supplier' => 'BioLab', 'expiryDate' => '2027-03-01',
            'manufacturerId' => $batch->manufacturer_id, 'manufacturingDate' => '2026-08-15',
            'status' => 'active', 'cancelledAt' => null, 'cancelledBy' => null,
        ]);

        $this->assertSame('BioLab Pharma', $batch->manufacturer->name);
        $this->assertSame(20, $batch->quantity);
        $this->assertSame('7.0000', $this->item->fresh()->avg_unit_cost);   // (10x5 + 20x8) / 30
    }

    public function test_the_optional_fields_can_be_left_out(): void
    {
        $response = $this->postJson('/api/transactions/incoming', [
            'itemId' => $this->item->id, 'batchNumber' => 'B-1', 'quantity' => 5, 'unitCost' => 0, 'date' => '2026-11-11',
        ])->assertCreated();

        $response->assertJson(['supplier' => null, 'expiryDate' => null, 'manufacturerId' => null, 'manufacturingDate' => null, 'unitCost' => 0]);
        $this->assertSame(0, Manufacturer::count());
    }

    public function test_an_existing_manufacturer_is_found_by_any_spelling(): void
    {
        $existing = Manufacturer::create(['name' => 'Pharma Co.', 'normalized_name' => 'pharmaco']);

        $this->receive(['manufacturer' => 'PHARMACO'])->assertJson(['manufacturerId' => $existing->id]);
        $this->assertSame(1, Manufacturer::count());
    }

    public function test_the_recorder_comes_from_the_token_not_the_request(): void
    {
        $other = User::factory()->create();

        $this->receive(['recordedBy' => $other->id])->assertJson(['recordedBy' => $this->user->id]);
    }

    // -- 422 -------------------------------------------------------------------------------

    #[DataProvider('invalidFields')]
    public function test_an_invalid_field_is_a_422_on_that_field(array $changes, string $field): void
    {
        $this->receive($changes)->assertStatus(422)->assertJsonValidationErrors($field);
        $this->assertSame(0, Batch::count(), 'nothing is saved');
    }

    public static function invalidFields(): array
    {
        return [
            'unknown item' => [['itemId' => 999], 'itemId'],
            'no quantity' => [['quantity' => null], 'quantity'],
            'zero quantity' => [['quantity' => 0], 'quantity'],
            'fractional quantity' => [['quantity' => 2.5], 'quantity'],
            'missing unit cost (not read as 0)' => [['unitCost' => null], 'unitCost'],
            'negative unit cost' => [['unitCost' => -1], 'unitCost'],
            'no date' => [['date' => null], 'date'],
            'impossible date' => [['date' => '2026-02-31'], 'date'],
            'future date' => [['date' => '2026-11-12'], 'date'],
            'no batch number' => [['batchNumber' => '  '], 'batchNumber'],
            'already expired on arrival' => [['date' => '2026-11-10', 'expiryDate' => '2026-11-09'], 'expiryDate'],
            'invalid expiry date' => [['expiryDate' => '11/12/2027'], 'expiryDate'],
            'supplier too long' => [['supplier' => str_repeat('a', 151)], 'supplier'],
            'manufacturer too long' => [['manufacturer' => str_repeat('a', 151)], 'manufacturer'],
            'manufactured in the future' => [['manufacturingDate' => '2026-11-12'], 'manufacturingDate'],
            'manufactured after receipt' => [['date' => '2026-11-01', 'manufacturingDate' => '2026-11-05'], 'manufacturingDate'],
            'manufactured after expiry' => [['date' => '2026-11-10', 'expiryDate' => '2026-11-10', 'manufacturingDate' => '2026-11-11'], 'manufacturingDate'],
            'manufacturer without letters' => [['manufacturer' => '...'], 'manufacturer'],
        ];
    }

    public function test_a_back_dated_receipt_of_a_batch_that_has_expired_since_is_accepted(): void
    {
        $this->receive(['date' => '2026-10-01', 'expiryDate' => '2026-10-20'])->assertCreated();
    }

    public function test_an_archived_item_cannot_receive_stock(): void
    {
        $this->item->forceFill(['archived_at' => now()])->save();

        $this->receive()->assertStatus(422)->assertJsonValidationErrors('itemId');
    }

    // -- 409: batch number -----------------------------------------------------------------

    public function test_a_batch_number_in_use_for_the_same_item_and_manufacturer_is_a_409(): void
    {
        $this->receive(['batchNumber' => 'PC-101', 'manufacturer' => 'Nova Pharma']);

        $this->receive(['batchNumber' => 'pc-101', 'manufacturer' => 'nova pharma'])
            ->assertStatus(409)
            ->assertJsonPath('errors.batchNumber', fn ($message) => str_contains($message, 'pc-101'));
        $this->assertSame(1, Batch::count());
    }

    public function test_batches_without_a_manufacturer_form_one_group(): void
    {
        $this->receive(['batchNumber' => 'PC-101']);

        $this->receive(['batchNumber' => 'PC-101'])->assertStatus(409);
    }

    public function test_the_same_number_is_allowed_from_another_manufacturer_or_for_another_item(): void
    {
        $this->receive(['batchNumber' => 'PC-101', 'manufacturer' => 'Nova Pharma']);

        $this->receive(['batchNumber' => 'PC-101', 'manufacturer' => 'Medica Labs'])->assertCreated();
        $this->receive(['batchNumber' => 'PC-101'])->assertCreated();
        $this->receive(['batchNumber' => 'PC-101', 'manufacturer' => 'Nova Pharma', 'itemId' => Item::factory()->create()->id])->assertCreated();
    }

    public function test_a_cancelled_receipt_frees_its_batch_number(): void
    {
        $first = $this->receive(['batchNumber' => 'PC-101']);
        Transaction::find($first->json('id'))->forceFill(['status' => TransactionStatus::Cancelled])->save();

        $this->receive(['batchNumber' => 'PC-101'])->assertCreated();
    }

    public function test_a_refused_receipt_leaves_no_new_manufacturer_behind(): void
    {
        $this->receive(['batchNumber' => 'PC-101']);

        $this->receive(['batchNumber' => 'PC-101', 'manufacturer' => null])->assertStatus(409);
        $this->receive(['batchNumber' => 'PC-101', 'manufacturer' => 'Brand New Labs'])->assertCreated();
        $this->receive(['batchNumber' => 'PC-102', 'quantity' => 0, 'manufacturer' => 'Never Saved Ltd'])->assertStatus(422);

        $this->assertSame(['Brand New Labs'], Manufacturer::pluck('name')->all());
    }

    // -- listing ---------------------------------------------------------------------------

    public function test_the_list_is_newest_first_and_includes_cancelled_receipts(): void
    {
        $old = $this->receive(['batchNumber' => 'OLD'])->json('id');
        $this->travel(1)->minutes();
        $new = $this->receive(['batchNumber' => 'NEW'])->json('id');
        Transaction::find($old)->forceFill(['status' => TransactionStatus::Cancelled])->save();

        $this->getJson('/api/transactions/incoming')
            ->assertOk()
            ->assertJsonPath('*.id', [$new, $old])
            ->assertJsonPath('1.status', 'cancelled');
    }

    public function test_the_list_filters_by_item_and_date(): void
    {
        $other = Item::factory()->create();
        $this->receive(['date' => '2026-10-01']);
        $inRange = $this->receive(['date' => '2026-10-15'])->json('id');
        $this->receive(['date' => '2026-10-15', 'itemId' => $other->id]);

        $this->getJson("/api/transactions/incoming?itemId={$this->item->id}&from=2026-10-10&to=2026-10-15")
            ->assertJsonPath('*.id', [$inRange]);
    }

    #[DataProvider('searches')]
    public function test_search_matches(string $search): void
    {
        $match = $this->receive(['batchNumber' => 'SS-402', 'supplier' => 'BioLab', 'manufacturer' => 'Nova Pharma'])->json('id');
        $this->receive(['batchNumber' => 'XX-1', 'itemId' => Item::factory()->create(['name' => 'Gloves'])->id]);

        $this->getJson('/api/transactions/incoming?search='.urlencode($search))->assertJsonPath('*.id', [$match]);
    }

    public static function searches(): array
    {
        return [
            'item name' => ['saline'], 'batch number' => ['ss-40'], 'supplier' => ['biolab'],
            'manufacturer' => ['nova'],
        ];
    }

    public function test_search_matches_the_recorder_name(): void
    {
        $mine = $this->receive()->json('id');
        $this->actingAsStorekeeper(User::factory()->create(['name' => 'Reem Haboush']));
        $this->receive();

        $this->getJson('/api/transactions/incoming?search=omar')->assertJsonPath('*.id', [$mine]);
    }

    private function receive(array $changes = []): \Illuminate\Testing\TestResponse
    {
        static $counter = 0;

        return $this->postJson('/api/transactions/incoming', array_merge([
            'itemId' => $this->item->id,
            'batchNumber' => 'B-'.++$counter,
            'quantity' => 10,
            'unitCost' => 5,
            'date' => '2026-11-10',
            'expiryDate' => '2027-11-10',
            'supplier' => 'MedSupply',
        ], $changes));
    }
}
