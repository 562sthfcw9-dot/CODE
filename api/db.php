<?php
declare(strict_types=1);

// Update these values for your InfinityFree or local MySQL database.
// Auto-switch DB config: localhost uses local MySQL, live host uses InfinityFree.
$httpHost = (string)($_SERVER['HTTP_HOST'] ?? '');
$serverName = (string)($_SERVER['SERVER_NAME'] ?? '');
$hostOnly = strtolower((string)preg_replace('/:\\d+$/', '', $httpHost));
// Treat localhost, 127.0.0.1, and any private LAN IP (192.168.x.x / 10.x.x.x / 172.16-31.x.x) as local
$isLocalHost = in_array($hostOnly, ['localhost', '127.0.0.1'], true)
    || in_array(strtolower($serverName), ['localhost', '127.0.0.1'], true)
    || (bool)preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/', $hostOnly)
    || (bool)preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/', strtolower($serverName));

    
if ($isLocalHost) {
    define('DB_HOST', '127.0.0.1');
    define('DB_NAME', 'trapico');
    define('DB_USER', 'root');
    define('DB_PASS', '');
} else {
    define('DB_HOST', 'sql110.infinityfree.com');
    define('DB_NAME', 'if0_41845667_trapico');
    define('DB_USER', 'if0_41845667');
    define('DB_PASS', 'Trapico26');
}

define('UPLOAD_PATH', __DIR__ . '/../uploads');
define('UPLOAD_URL', '/uploads');

function getDb(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=3307;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);
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

    $info = password_get_info($storedHash);
    if (!empty($info['algo'])) {
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
