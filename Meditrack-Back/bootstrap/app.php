<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Every API error has the body the frontend expects (BACKEND_HANDOFF.md, "Error format"):
        //   { "message": "Shown to the user", "errors": { "field": "One message for that input" } }

        // 422: Laravel lists several messages per field; the forms show one under each input.
        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            $errors = collect($e->errors())->map(fn (array $messages) => $messages[0]);

            return response()->json(['message' => $errors->first(), 'errors' => $errors], $e->status);
        });

        // Every HTTP error (abort(403), an unknown record, an unknown route...) gets a clean
        // message and never a stack trace.
        //   404: Laravel's own message names the model class ("No query results for model
        //        [App\Models\Item]"), which users should not see.
        //   403: keeps a specific message (e.g. "This account is inactive...") when one was given.
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            $status = $e->getStatusCode();
            $message = match (true) {
                $status === 404 => 'The requested record was not found.',
                $status === 403 && in_array($e->getMessage(), ['', 'This action is unauthorized.'], true)
                    => 'You do not have permission to perform this action.',
                default => $e->getMessage() ?: (Response::$statusTexts[$status] ?? 'Something went wrong.'),
            };

            return response()->json(['message' => $message], $status, $e->getHeaders());
        });

        // 401 (no or expired token) keeps Laravel's default JSON: { "message": "Unauthenticated." }.
        // 409 is rendered by App\Exceptions\ConflictException itself.
    })->create();
