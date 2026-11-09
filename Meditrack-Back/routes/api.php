<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Every route in this file is served under the /api prefix (set in bootstrap/app.php),
// which matches the frontend's VITE_API_BASE_URL, e.g. http://localhost:8000/api.

// Temporary check route for the Sanctum setup. It is replaced by GET /auth/me in phase 2.
Route::get('/user', fn (Request $request) => $request->user())->middleware('auth:sanctum');
