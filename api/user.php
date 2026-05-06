<?php
require_once __DIR__ . '/init.php';

$data = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'profile'));
$user = requireLogin();
$db = getDb();
$currentRole = $user['role'] ?? '';
$currentId = $user['id'] ?? 0;

if ($action === 'profile') {
    $profile = ['role' => $currentRole, 'id' => $currentId, 'name' => $user['name'] ?? '', 'email' => $user['email'] ?? ''];

    if ($currentRole === 'regular') {
        $stmt = $db->prepare('SELECT username, first_name, last_name, email, phone_number, home_barangay FROM citizen_accounts WHERE citizen_id = :id');
        $stmt->execute([':id' => $currentId]);
        $row = $stmt->fetch();
        if ($row) {
            $profile['username'] = $row['username'];
            $profile['name'] = trim($row['first_name'] . ' ' . $row['last_name']);
            $profile['email'] = $row['email'];
            $profile['phone'] = $row['phone_number'];
            $profile['home_barangay'] = $row['home_barangay'];
        }
    } elseif ($currentRole === 'dispatch') {
        $stmt = $db->prepare('SELECT admin_full_name AS name, admin_email AS email FROM dispatch_admin_accounts WHERE admin_id = :id');
        $stmt->execute([':id' => $currentId]);
        $row = $stmt->fetch();
        if ($row) {
            $profile['name'] = $row['name'];
            $profile['email'] = $row['email'];
        }
    } elseif ($currentRole === 'field') {
        $stmt = $db->prepare('SELECT full_name AS name, email_address AS email, phone_number AS phone, assigned_barangay_jurisdiction AS home_barangay FROM field_officer_accounts WHERE officer_id = :id');
        $stmt->execute([':id' => $currentId]);
        $row = $stmt->fetch();
        if ($row) {
            $profile['name'] = $row['name'];
            $profile['email'] = $row['email'];
            $profile['phone'] = $row['phone'];
            $profile['home_barangay'] = $row['home_barangay'];
        }
    }

    successResponse(['user' => $profile]);
}

if ($action === 'updateProfile') {
    $name = trim((string)($data['name'] ?? ''));
    $email = trim((string)($data['email'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $brgy = trim((string)($data['brgy'] ?? ''));

    if ($name === '' || $email === '') {
        errorResponse('Name and email are required.');
    }

    if ($currentRole === 'regular') {
        if ($phone === '' || $brgy === '') {
            errorResponse('Phone and barangay are required for civilian profile updates.');
        }
        $names = explode(' ', $name, 2);
        $firstName = $names[0];
        $lastName = $names[1] ?? '';
        $stmt = $db->prepare('UPDATE citizen_accounts SET first_name = :first, last_name = :last, email = :email, phone_number = :phone, home_barangay = :brgy WHERE citizen_id = :id');
        $stmt->execute([':first' => $firstName, ':last' => $lastName, ':email' => $email, ':phone' => $phone, ':brgy' => $brgy, ':id' => $currentId]);
    } elseif ($currentRole === 'dispatch') {
        $stmt = $db->prepare('UPDATE dispatch_admin_accounts SET admin_full_name = :name, admin_email = :email WHERE admin_id = :id');
        $stmt->execute([':name' => $name, ':email' => $email, ':id' => $currentId]);
    } elseif ($currentRole === 'field') {
        if ($phone === '') {
            errorResponse('Phone is required for field officer profile updates.');
        }
        $stmt = $db->prepare('UPDATE field_officer_accounts SET full_name = :name, email_address = :email, phone_number = :phone WHERE officer_id = :id');
        $stmt->execute([':name' => $name, ':email' => $email, ':phone' => $phone, ':id' => $currentId]);
    } else {
        errorResponse('Profile updates are not supported for this role.', 403);
    }

    $_SESSION['trapico_user']['name'] = $name;
    $_SESSION['trapico_user']['email'] = $email;
    successResponse(['message' => 'Profile updated successfully.', 'user' => $_SESSION['trapico_user']]);
}

if ($action === 'changePassword') {
    $currentPassword = trim((string)($data['currentPassword'] ?? ''));
    $newPassword = trim((string)($data['newPassword'] ?? ''));

    if ($currentPassword === '' || $newPassword === '') {
        errorResponse('Current and new passwords are required.');
    }
    if (strlen($newPassword) < 8) {
        errorResponse('New password must be at least 8 characters.');
    }

    if ($currentRole === 'regular') {
        $stmt = $db->prepare('SELECT password_hash FROM citizen_accounts WHERE citizen_id = :id');
        $stmt->execute([':id' => $currentId]);
        $stored = $stmt->fetchColumn();
        if (!verifyPassword($currentPassword, $stored)) {
            errorResponse('Current password is incorrect.');
        }
        $hash = hashPassword($newPassword);
        $db->prepare('UPDATE citizen_accounts SET password_hash = :hash WHERE citizen_id = :id')->execute([':hash' => $hash, ':id' => $currentId]);
    } elseif ($currentRole === 'dispatch') {
        $stmt = $db->prepare('SELECT admin_password AS password_hash FROM dispatch_admin_accounts WHERE admin_id = :id');
        $stmt->execute([':id' => $currentId]);
        $stored = $stmt->fetchColumn();
        if (!verifyPassword($currentPassword, $stored)) {
            errorResponse('Current password is incorrect.');
        }
        $hash = hashPassword($newPassword);
        $db->prepare('UPDATE dispatch_admin_accounts SET admin_password = :hash WHERE admin_id = :id')->execute([':hash' => $hash, ':id' => $currentId]);
    } elseif ($currentRole === 'field') {
        $stmt = $db->prepare('SELECT password_hash FROM field_officer_accounts WHERE officer_id = :id');
        $stmt->execute([':id' => $currentId]);
        $stored = $stmt->fetchColumn();
        if (!verifyPassword($currentPassword, $stored)) {
            errorResponse('Current password is incorrect.');
        }
        $hash = hashPassword($newPassword);
        $db->prepare('UPDATE field_officer_accounts SET password_hash = :hash WHERE officer_id = :id')->execute([':hash' => $hash, ':id' => $currentId]);
    } else {
        errorResponse('Password changes are not allowed for this role.', 403);
    }

    successResponse(['message' => 'Password changed successfully.']);
}

errorResponse('Unknown action.');
