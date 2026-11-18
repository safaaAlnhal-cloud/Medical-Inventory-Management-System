<?php

use App\Services\NotificationService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Owner: Developer B. Phase 4. BACKEND_HANDOFF.md section 4.6.
// Some alerts change with the date alone: a batch becomes expiring soon or expired, an account
// reaches its last 7 days or its last day. Run by hand with: php artisan notifications:sync
Artisan::command('notifications:sync', function (NotificationService $notifications) {
    $notifications->syncAll();
    $this->info('Notifications are up to date.');
})->purpose('Bring every stock, expiry and account alert up to date');

// Every night, just after midnight (Asia/Gaza). The scheduler runs only while
// "php artisan schedule:work" (or a cron entry for "schedule:run") is running; without it, the
// first read of a new day syncs instead (NotificationService::syncOncePerDay).
Schedule::command('notifications:sync')->dailyAt('00:05');
