<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

/**
 * A request that is valid on its own but conflicts with existing data (HTTP 409):
 * a duplicate name or email, a category still in use, an already cancelled transaction...
 *
 * Throw it with a field name when the conflict belongs to one form input, so the frontend
 * shows the message under that input:
 *
 *     throw ConflictException::on('email', 'Another account already uses this email address.');
 *     throw new ConflictException('This transaction is already cancelled.');
 */
class ConflictException extends Exception
{
    public function __construct(string $message, private readonly ?string $field = null)
    {
        parent::__construct($message);
    }

    public static function on(string $field, string $message): self
    {
        return new self($message, $field);
    }

    // Laravel calls render() automatically when this exception is not caught.
    public function render(): JsonResponse
    {
        $body = ['message' => $this->getMessage()];
        if ($this->field !== null) {
            $body['errors'] = [$this->field => $this->getMessage()];
        }

        return response()->json($body, 409);
    }
}
