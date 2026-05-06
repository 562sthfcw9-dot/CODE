<?php
declare(strict_types=1);

// Update these values for your InfinityFree or local MySQL database.
define('DB_HOST', 'localhost');
define('DB_NAME', 'trapico');
define('DB_USER', 'root');
define('DB_PASS', '');

define('UPLOAD_PATH', __DIR__ . '/../uploads');
define('UPLOAD_URL', '/uploads');

function getDb(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function hashPassword(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function verifyPassword(string $password, string $storedHash): bool
{
    if (!is_string($storedHash) || $storedHash === '') {
        return false;
    }

    if (password_get_info($storedHash)['algo'] !== 0) {
        return password_verify($password, $storedHash);
    }

    return hash_equals($storedHash, $password);
}

function ensureUploadPath(): void
{
    if (!is_dir(UPLOAD_PATH)) {
        mkdir(UPLOAD_PATH, 0755, true);
    }
}

function buildUploadPath(string $filename): string
{
    ensureUploadPath();
    $clean = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
    return UPLOAD_PATH . '/' . uniqid('', true) . '-' . $clean;
}
