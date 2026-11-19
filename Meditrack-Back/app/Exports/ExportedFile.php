<?php

namespace App\Exports;

/** A finished export file, ready to be sent as a download. */
final readonly class ExportedFile
{
    public function __construct(
        public string $content,
        public string $contentType,
        public string $filename,
    ) {}
}
