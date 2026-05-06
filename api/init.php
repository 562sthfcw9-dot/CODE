<?php
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function getJsonPayload(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (is_array($data)) {
        return $data;
    }
    return $_POST;
}

function jsonResponse(array $payload, int $status = 200): void
{
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function successResponse(array $data = []): void
{
    jsonResponse(array_merge(['success' => true], $data));
}

function errorResponse(string $message, int $status = 400): void
{
    jsonResponse(['success' => false, 'error' => $message], $status);
}

function getCurrentUser(): ?array
{
    return $_SESSION['trapico_user'] ?? null;
}

function requireLogin(): array
{
    $user = getCurrentUser();
    if ($user === null) {
        errorResponse('Unauthorized. Please log in.', 401);
    }
    return $user;
}

function requireRole(string $role): array
{
    $user = requireLogin();
    if (!isset($user['role']) || $user['role'] !== $role) {
        errorResponse('Forbidden. Your role cannot access this endpoint.', 403);
    }
    return $user;
}
