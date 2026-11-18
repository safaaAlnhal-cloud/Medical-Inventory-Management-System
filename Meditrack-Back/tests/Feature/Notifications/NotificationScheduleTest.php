<?php

namespace Tests\Feature\Notifications;

use App\Models\User;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** php artisan notifications:sync, and its nightly run from routes/console.php. */
class NotificationScheduleTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_command_syncs_every_alert(): void
    {
        $this->travelTo('2026-11-18 10:00');
        $reem = User::factory()->create(['account_expires_on' => '2026-11-20']);
        $this->assertDatabaseCount('notifications', 0);   // created without UserService

        $this->artisan('notifications:sync')
            ->expectsOutput('Notifications are up to date.')
            ->assertSuccessful();

        $this->assertDatabaseHas('notifications', ['key' => "account_expiring-{$reem->id}"]);
    }

    public function test_the_command_runs_every_night_at_00_05(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $event) => str_contains($event->command, 'notifications:sync'));

        $this->assertNotNull($event, 'notifications:sync is scheduled');
        $this->assertSame('5 0 * * *', $event->expression);
    }
}
