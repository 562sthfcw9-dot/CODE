<?php
require_once __DIR__ . '/init.php';

$data = getJsonPayload();

$role = trim((string)($data['role'] ?? ''));
$username = trim((string)($data['username'] ?? ''));
$phone = trim((string)($data['phone_number'] ?? ''));
$barangay = trim((string)($data['home_barangay'] ?? ''));
$password = (string)($data['password'] ?? '');

if ($role === '' || $username === '' || $phone === '' || $barangay === '' || $password === '') {
    errorResponse('Missing required fields.');
}

if (strlen($password) < 8 || !preg_match('/[A-Z]/', $password)) {
    errorResponse('Password must be at least 8 characters and include one uppercase letter.');
}

if (!in_array($role, ['regular', 'dispatch', 'field'], true)) {
    errorResponse('Invalid role selected.');
}

function normalizeEmail(string $username, string $role): string
{
    $base = strtolower(preg_replace('/[^a-zA-Z0-9._-]/', '', $username));
    if ($base === '') {
        $base = 'user' . time();
    }
    return $base . '+' . $role . '@trapico.local';
}

function uniqueEmail(PDO $db, string $table, string $column, string $email): string
{
    $candidate = $email;
    $suffix = 1;

    while (true) {
        $stmt = $db->prepare("SELECT 1 FROM {$table} WHERE {$column} = :email LIMIT 1");
        $stmt->execute([':email' => $candidate]);
        if (!$stmt->fetchColumn()) {
            return $candidate;
        }

        $parts = explode('@', $email, 2);
        $candidate = $parts[0] . '.' . $suffix . '@' . ($parts[1] ?? 'trapico.local');
        $suffix++;
    }
}

$db = getDb();

try {
    if ($role === 'regular') {
        $exists = $db->prepare('SELECT 1 FROM citizen_accounts WHERE username = :username LIMIT 1');
        $exists->execute([':username' => $username]);
        if ($exists->fetchColumn()) {
            errorResponse('Username is already registered.');
        }

        $email = uniqueEmail($db, 'citizen_accounts', 'email', normalizeEmail($username, $role));
        $insert = $db->prepare('INSERT INTO citizen_accounts (username, password_hash, email, phone_number, home_barangay) VALUES (:username, :password_hash, :email, :phone, :barangay)');
        $insert->execute([
            ':username' => $username,
            ':password_hash' => hashPassword($password),
            ':email' => $email,
            ':phone' => $phone,
            ':barangay' => $barangay,
        ]);
    } elseif ($role === 'dispatch') {
        $exists = $db->prepare('SELECT 1 FROM dispatch_admin_accounts WHERE admin_full_name = :name OR admin_email = :email LIMIT 1');
        $baseEmail = normalizeEmail($username, $role);
        $email = uniqueEmail($db, 'dispatch_admin_accounts', 'admin_email', $baseEmail);
        $exists->execute([':name' => $username, ':email' => $email]);
        if ($exists->fetchColumn()) {
            errorResponse('Account is already registered.');
        }

        $insert = $db->prepare('INSERT INTO dispatch_admin_accounts (admin_full_name, admin_email, admin_password, admin_role) VALUES (:name, :email, :password_hash, :role)');
        $insert->execute([
            ':name' => $username,
            ':email' => $email,
            ':password_hash' => hashPassword($password),
            ':role' => 'dispatch_officer',
        ]);
    } else {
        $exists = $db->prepare('SELECT 1 FROM field_officer_accounts WHERE employee_id_number = :employee OR email_address = :email LIMIT 1');
        $baseEmail = normalizeEmail($username, $role);
        $email = uniqueEmail($db, 'field_officer_accounts', 'email_address', $baseEmail);
        $exists->execute([':employee' => $username, ':email' => $email]);
        if ($exists->fetchColumn()) {
            errorResponse('Account is already registered.');
        }

        $insert = $db->prepare('INSERT INTO field_officer_accounts (employee_id_number, full_name, email_address, password_hash, phone_number, assigned_barangay_jurisdiction) VALUES (:employee, :name, :email, :password_hash, :phone, :barangay)');
        $insert->execute([
            ':employee' => $username,
            ':name' => $username,
            ':email' => $email,
            ':password_hash' => hashPassword($password),
            ':phone' => $phone,
            ':barangay' => $barangay,
        ]);
    }
} catch (PDOException $e) {
    errorResponse('Database error: ' . $e->getMessage(), 500);
}

successResponse(['message' => 'Account created successfully.']);
