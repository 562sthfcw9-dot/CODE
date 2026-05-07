<?php
require_once __DIR__ . '/init.php';

$data        = getJsonPayload();
$action      = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'profile'));
$user        = requireLogin();
$db          = getDb();
$currentRole = $user['role'] ?? '';
$currentId   = (int)($user['id'] ?? 0);        // extension PK (dispatch_id / officer_id / user_id)
$currentUid  = (int)($user['user_id'] ?? $currentId);  // always Users.user_id

if ($action === 'profile') {
    $profile = [
        'role'  => $currentRole,
        'id'    => $currentId,
        'name'  => $user['name'] ?? '',
        'email' => $user['email'] ?? '',
    ];

    if ($currentRole === 'regular') {
        $stmt = $db->prepare(
            'SELECT username, full_name AS name, email, phone_number, barangay AS home_barangay
             FROM Users WHERE user_id = :uid'
        );
        $stmt->execute([':uid' => $currentUid]);
        $row = $stmt->fetch();
        if ($row) {
            $profile['username']      = $row['username'];
            $profile['name']          = $row['name'];
            $profile['email']         = $row['email'];
            $profile['phone']         = $row['phone_number'];
            $profile['home_barangay'] = $row['home_barangay'];
        }

    } elseif ($currentRole === 'dispatch') {
        $stmt = $db->prepare(
            'SELECT u.username, u.full_name AS name, u.email
             FROM Users u
             JOIN Dispatch_officers d ON d.user_id = u.user_id
             WHERE d.dispatch_id = :id'
        );
        $stmt->execute([':id' => $currentId]);
        $row = $stmt->fetch();
        if ($row) {
            $profile['username'] = $row['username'];
            $profile['name']     = $row['name'];
            $profile['email']    = $row['email'];
        }

    } elseif ($currentRole === 'field') {
        $stmt = $db->prepare(
            'SELECT u.username, u.full_name AS name, u.email, u.phone_number AS phone,
                    f.assigned_barangay AS home_barangay
             FROM Users u
             JOIN Field_officers f ON f.user_id = u.user_id
             WHERE f.officer_id = :id'
        );
        $stmt->execute([':id' => $currentId]);
        $row = $stmt->fetch();
        if ($row) {
            $profile['username']      = $row['username'];
            $profile['name']          = $row['name'];
            $profile['email']         = $row['email'];
            $profile['phone']         = $row['phone'];
            $profile['home_barangay'] = $row['home_barangay'];
        }
    }

    successResponse(['user' => $profile]);
}

if ($action === 'updateProfile') {
    $name  = trim((string)($data['name'] ?? ''));
    $email = trim((string)($data['email'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $brgy  = trim((string)($data['brgy'] ?? ''));

    if ($name === '' || $email === '') {
        errorResponse('Name and email are required.');
    }

    if ($currentRole === 'regular') {
        if ($phone === '' || $brgy === '') {
            errorResponse('Phone and barangay are required for civilian profile updates.');
        }
        $stmt = $db->prepare(
            'UPDATE Users SET full_name = :name, email = :email, phone_number = :phone, barangay = :brgy WHERE user_id = :uid'
        );
        $stmt->execute([':name' => $name, ':email' => $email, ':phone' => $phone, ':brgy' => $brgy, ':uid' => $currentUid]);

    } elseif ($currentRole === 'dispatch') {
        $stmt = $db->prepare('UPDATE Users SET full_name = :name, email = :email WHERE user_id = :uid');
        $stmt->execute([':name' => $name, ':email' => $email, ':uid' => $currentUid]);

    } elseif ($currentRole === 'field') {
        if ($phone === '') {
            errorResponse('Phone is required for field officer profile updates.');
        }
        $stmt = $db->prepare('UPDATE Users SET full_name = :name, email = :email, phone_number = :phone WHERE user_id = :uid');
        $stmt->execute([':name' => $name, ':email' => $email, ':phone' => $phone, ':uid' => $currentUid]);
        if ($brgy !== '') {
            $db->prepare('UPDATE Field_officers SET assigned_barangay = :brgy WHERE officer_id = :id')
               ->execute([':brgy' => $brgy, ':id' => $currentId]);
        }

    } else {
        errorResponse('Profile updates are not supported for this role.', 403);
    }

    $_SESSION['trapico_user']['name']  = $name;
    $_SESSION['trapico_user']['email'] = $email;
    successResponse(['message' => 'Profile updated successfully.', 'user' => $_SESSION['trapico_user']]);
}

if ($action === 'changePassword') {
    $currentPassword = trim((string)($data['currentPassword'] ?? ''));
    $newPassword     = trim((string)($data['newPassword'] ?? ''));

    if ($currentPassword === '' || $newPassword === '') {
        errorResponse('Current and new passwords are required.');
    }
    if (strlen($newPassword) < 8) {
        errorResponse('New password must be at least 8 characters.');
    }

    $stmt = $db->prepare('SELECT password_hash FROM Users WHERE user_id = :uid');
    $stmt->execute([':uid' => $currentUid]);
    $stored = $stmt->fetchColumn();

    if (!verifyPassword($currentPassword, $stored)) {
        errorResponse('Current password is incorrect.');
    }

    $hash = hashPassword($newPassword);
    $db->prepare('UPDATE Users SET password_hash = :hash WHERE user_id = :uid')
       ->execute([':hash' => $hash, ':uid' => $currentUid]);

    successResponse(['message' => 'Password changed successfully.']);
}

errorResponse('Unknown action.');
