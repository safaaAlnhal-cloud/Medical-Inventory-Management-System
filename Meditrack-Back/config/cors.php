<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    // Only the API is called from the React app. The SPA cookie route of Sanctum is not used,
    // because the frontend authenticates with a Bearer token.
    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    // The React app's address. Set FRONTEND_URL in .env when it runs elsewhere; several
    // addresses can be given separated by commas.
    'allowed_origins' => explode(',', env('FRONTEND_URL', 'http://localhost:5173')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    // The browser keeps a preflight answer this many seconds (2 hours, Chrome's own limit), so
    // a request with the Authorization header is not preceded by an OPTIONS request every time.
    'max_age' => 7200,

    'supports_credentials' => false,

];
