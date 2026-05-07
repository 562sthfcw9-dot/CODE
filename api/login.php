<?php
require_once __DIR__ . '/init.php';

$data = getJsonPayload();
$username = trim((string)($data['username'] ?? ''));
$password = trim((string)($data['password'] ?? ''));
$role = trim((string)($data['role'] ?? ''));

if ($username === '' || $password === '' || $role === '') {
    errorResponse('Username, password, and role are required.');
}

$db = getDb();
$user = null;
$redirect = 'index.html';

try {
    if ($role === 'regular') {
        $stmt = $db->prepare('SELECT citizen_id AS id, username, password_hash, first_name, last_name, email, phone_number, home_barangay FROM citizen_accounts WHERE username = :username OR email = :email');
        $stmt->execute([':username' => $username, ':email' => $username]);
        $user = $stmt->fetch();
        $redirect = 'CITIZEN/civilian.html';
    } elseif ($role === 'dispatch') {
        $stmt = $db->prepare('SELECT admin_id AS id, admin_full_name AS name, admin_email AS email, admin_password AS password_hash FROM dispatch_admin_accounts WHERE admin_email = :username1 OR admin_full_name = :username2');
        $stmt->execute([':username1' => $username, ':username2' => $username]);
        $user = $stmt->fetch();
        $redirect = 'DISPATCH/dispatch.html?v=20260507';
    } elseif ($role === 'field') {
        $stmt = $db->prepare('SELECT officer_id AS id, full_name AS name, email_address AS email, password_hash FROM field_officer_accounts WHERE email_address = :username1 OR employee_id_number = :username2');
        $stmt->execute([':username1' => $username, ':username2' => $username]);
        $user = $stmt->fetch();
        $redirect = 'FIELD/field.html';
    } else {
        errorResponse('Invalid role selected.');
    }
} catch (PDOException $e) {
    errorResponse('Database error: ' . $e->getMessage());
}

if (!$user) {
    errorResponse('Invalid credentials.');
}

if (!verifyPassword($password, $user['password_hash'] ?? '')) {
    errorResponse('Invalid credentials.');
}

/* Update last login timestamp */
try {
    if ($role === 'regular') {
        $db->prepare('UPDATE citizen_accounts SET last_login_timestamp = NOW() WHERE citizen_id = :id')->execute([':id' => $user['id']]);
    } elseif ($role === 'dispatch') {
        $db->prepare('UPDATE dispatch_admin_accounts SET last_login_timestamp = NOW() WHERE admin_id = :id')->execute([':id' => $user['id']]);
    } elseif ($role === 'field') {
        $db->prepare('UPDATE field_officer_accounts SET last_login_timestamp = NOW() WHERE officer_id = :id')->execute([':id' => $user['id']]);
    }
} catch (PDOException $e) { /* non-fatal */ }

$_SESSION['trapico_user'] = [
    'id' => $user['id'],
    'role' => $role,
    'username' => $user['username'] ?? $username,
    'name' => trim($user['name'] ?? (($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''))),
    'email' => $user['email'] ?? '',
];

successResponse(['redirect' => $redirect, 'user' => $_SESSION['trapico_user']]);
