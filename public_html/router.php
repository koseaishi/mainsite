<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($path)) {
    http_response_code(400);
    exit;
}

$root = realpath(__DIR__);
$requestedFile = realpath(__DIR__ . rawurldecode($path));
if ($requestedFile !== false && is_dir($requestedFile)) {
    $requestedFile = realpath($requestedFile . DIRECTORY_SEPARATOR . 'index.html');
}

if ($requestedFile !== false
    && str_starts_with($requestedFile, $root . DIRECTORY_SEPARATOR)
    && is_file($requestedFile)
) {
    if (strtolower(pathinfo($requestedFile, PATHINFO_EXTENSION)) === 'html') {
        header('Content-Type: text/html; charset=utf-8');
        readfile($requestedFile);
        exit;
    }

    return false;
}

http_response_code(404);
