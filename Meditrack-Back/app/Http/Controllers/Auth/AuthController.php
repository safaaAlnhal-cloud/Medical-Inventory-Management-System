<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\AuthUserResource;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AuthController extends Controller
{
    public function __construct(private readonly AuthService $auth) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $session = $this->auth->login(
            $request->validated('email'),
            $request->validated('password'),
            $request->boolean('remember'),
        );

        return response()->json([
            'token' => $session['token'],
            'user' => new AuthUserResource($session['user']),
        ]);
    }

    public function me(Request $request): AuthUserResource
    {
        return new AuthUserResource($request->user());
    }

    public function logout(Request $request): Response
    {
        $this->auth->logout($request->user());

        return response()->noContent();
    }
}
