<?php

namespace App\Http\Controllers\Profile;

use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\ChangePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Services\ProfileService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ProfileController extends Controller
{
    public function __construct(private readonly ProfileService $profile) {}

    public function show(Request $request): UserResource
    {
        return new UserResource($this->profile->show($request->user()));
    }

    public function update(UpdateProfileRequest $request): UserResource
    {
        return new UserResource($this->profile->update($request->user(), $request->validated()));
    }

    public function changePassword(ChangePasswordRequest $request): Response
    {
        $this->profile->changePassword(
            $request->user(),
            $request->validated('currentPassword'),
            $request->validated('newPassword'),
        );

        return response()->noContent();
    }
}
