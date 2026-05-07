<?php
/**
 * sync_accounts.php  — one-time seed sync
 * Inserts missing seed accounts and re-hashes any plain-text passwords.
 * Delete this file after use.
 */
require_once __DIR__ . '/api/db.php';
$pdo = getDB();

// ── Seed data ────────────────────────────────────────────────────────────────
$users = [
    // citizens
    ['rikka',       'rikka@gmail.com',           'Password123',    'Rikka Test',          '+639123456789', 'Commonwealth', 'citizen'],
    ['rosette',     'rosette@gmail.com',          'Password123',    'Rosette Test',        '+639987654321', 'Batasan Hills','citizen'],
    ['marcos',      'marcos@gmail.com',           'Password123',    'Marcos Test',         '+639112233445', 'Makati',       'citizen'],
    // dispatch
    ['fae',         'fae@trapico.gov',            'Password123',    'Fae Admin',           '+639111222333', 'Commonwealth', 'dispatch_officer'],
    ['dispatch2',   'dispatcher@trapico.gov',     'DispatchPass456','Officer Dispatcher',  '+639222333444', 'BGC',          'dispatch_officer'],
    // field
    ['cien',        'cien@trapico.gov',           'Password123',    'Officer Rivera',      '+639123456799', 'Commonwealth', 'field_officer'],
    ['javier',      'javier.d@trapico.gov',       'FieldPass2',     'Officer Javier',      '+639234567890', 'BGC',          'field_officer'],
    ['cruz',        'cruz.a@trapico.gov',         'FieldPass3',     'Officer Cruz',        '+639345678901', 'Makati',       'field_officer'],
];

$dispatchExtras = [
    // [username, badge, barangay, on_duty]
    ['fae',       'DISP-2024-0001', 'Commonwealth', 1],
    ['dispatch2', 'DISP-2024-0002', 'BGC',          1],
];

$fieldExtras = [
    // [username, badge, barangay, status, lat, lng]
    ['cien',   'EMP-2024-0032', 'Commonwealth', 'available', 14.6760, 121.0437],
    ['javier', 'EMP-2024-0033', 'BGC',          'offline',   14.5994, 121.0423],
    ['cruz',   'EMP-2024-0034', 'Makati',       'busy',      14.5631, 121.0203],
];

// ── Upsert users ─────────────────────────────────────────────────────────────
$log = [];
foreach ($users as [$uname, $email, $plain, $full, $phone, $barangay, $role]) {
    $hash = password_hash($plain, PASSWORD_DEFAULT);

    // Check if exists
    $stmt = $pdo->prepare('SELECT user_id, password_hash FROM Users WHERE username = ?');
    $stmt->execute([$uname]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        $ins = $pdo->prepare('INSERT INTO Users (username, email, password_hash, full_name, phone_number, barangay, role, is_active) VALUES (?,?,?,?,?,?,?,1)');
        $ins->execute([$uname, $email, $hash, $full, $phone, $barangay, $role]);
        $uid = $pdo->lastInsertId();
        $log[] = "✅ Inserted user: <b>$uname</b> (user_id=$uid, role=$role)";
    } else {
        $uid = $existing['user_id'];
        $info = password_get_info($existing['password_hash']);
        if (empty($info['algo'])) {
            // plain text — re-hash
            $upd = $pdo->prepare('UPDATE Users SET password_hash = ?, email = ?, full_name = ?, updated_at = NOW() WHERE user_id = ?');
            $upd->execute([$hash, $email, $full, $uid]);
            $log[] = "🔑 Re-hashed password for: <b>$uname</b> (user_id=$uid)";
        } else {
            $log[] = "⏭️  Skipped (already hashed): <b>$uname</b> (user_id=$uid)";
        }
    }
}

// ── Dispatch_officers extension ───────────────────────────────────────────────
foreach ($dispatchExtras as [$uname, $badge, $barangay, $duty]) {
    $stmt = $pdo->prepare('SELECT user_id FROM Users WHERE username = ?');
    $stmt->execute([$uname]);
    $uid = $stmt->fetchColumn();
    if (!$uid) { $log[] = "⚠️  User not found for dispatch extension: $uname"; continue; }

    $check = $pdo->prepare('SELECT dispatch_id FROM Dispatch_officers WHERE user_id = ?');
    $check->execute([$uid]);
    if (!$check->fetchColumn()) {
        $pdo->prepare('INSERT INTO Dispatch_officers (user_id, badge_number, assigned_barangay, is_on_duty) VALUES (?,?,?,?)')
            ->execute([$uid, $badge, $barangay, $duty]);
        $log[] = "✅ Inserted Dispatch_officer row for: <b>$uname</b> (badge=$badge)";
    } else {
        $log[] = "⏭️  Dispatch_officer row exists: <b>$uname</b>";
    }
}

// ── Field_officers extension ─────────────────────────────────────────────────
foreach ($fieldExtras as [$uname, $badge, $barangay, $status, $lat, $lng]) {
    $stmt = $pdo->prepare('SELECT user_id FROM Users WHERE username = ?');
    $stmt->execute([$uname]);
    $uid = $stmt->fetchColumn();
    if (!$uid) { $log[] = "⚠️  User not found for field extension: $uname"; continue; }

    $check = $pdo->prepare('SELECT officer_id FROM Field_officers WHERE user_id = ?');
    $check->execute([$uid]);
    if (!$check->fetchColumn()) {
        $pdo->prepare('INSERT INTO Field_officers (user_id, badge_number, assigned_barangay, is_available, current_latitude, current_longitude) VALUES (?,?,?,?,?,?)')
            ->execute([$uid, $badge, $barangay, $status, $lat, $lng]);
        $log[] = "✅ Inserted Field_officer row for: <b>$uname</b> (badge=$badge)";
    } else {
        $log[] = "⏭️  Field_officer row exists: <b>$uname</b>";
    }
}

// ── Show current account table ────────────────────────────────────────────────
$citizens  = $pdo->query("SELECT user_id, username, email, full_name FROM Users WHERE role='citizen' ORDER BY user_id")->fetchAll(PDO::FETCH_ASSOC);
$dispatch  = $pdo->query("SELECT u.user_id, u.username, u.email, u.full_name, d.badge_number, d.is_on_duty FROM Users u JOIN Dispatch_officers d ON d.user_id=u.user_id ORDER BY u.user_id")->fetchAll(PDO::FETCH_ASSOC);
$field     = $pdo->query("SELECT u.user_id, u.username, u.email, u.full_name, f.badge_number, f.is_available FROM Users u JOIN Field_officers f ON f.user_id=u.user_id ORDER BY u.user_id")->fetchAll(PDO::FETCH_ASSOC);

function tbl($rows, $cols) {
    echo '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:monospace">';
    echo '<tr style="background:#ddd">';
    foreach ($cols as $c) echo "<th>$c</th>";
    echo '</tr>';
    foreach ($rows as $r) {
        echo '<tr>';
        foreach ($cols as $k => $label) {
            $val = array_values($r)[$k] ?? '';
            echo "<td>" . htmlspecialchars((string)$val) . "</td>";
        }
        echo '</tr>';
    }
    echo '</table>';
}

?><!DOCTYPE html>
<html><head><title>Sync Accounts</title>
<style>body{font-family:sans-serif;padding:20px} h2{margin-top:30px} .log{background:#f5f5f5;padding:12px;border-radius:6px;margin-bottom:20px}</style>
</head><body>
<h1>Trapico — Account Sync</h1>

<div class="log">
<?php foreach ($log as $l) echo "<p>$l</p>"; if (!$log) echo '<p>Nothing to do.</p>'; ?>
</div>

<h2>Citizens (login at <code>citizen-login.html</code>)</h2>
<?php tbl($citizens, ['user_id','username','email','full_name']); ?>

<h2>Dispatch Officers (login at <code>dispatch-login.html</code>)</h2>
<?php tbl($dispatch, ['user_id','username','email','full_name','badge_number','is_on_duty']); ?>

<h2>Field Officers (login at <code>field-login.html</code>)</h2>
<?php tbl($field, ['user_id','username','email','full_name','badge_number','is_available']); ?>

<hr>
<h3>Seed Passwords (for reference)</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:monospace">
<tr style="background:#ddd"><th>Username</th><th>Password</th><th>Role</th><th>Login URL</th></tr>
<tr><td>rikka</td><td>Password123</td><td>citizen</td><td>citizen-login.html</td></tr>
<tr><td>rosette</td><td>Password123</td><td>citizen</td><td>citizen-login.html</td></tr>
<tr><td>marcos</td><td>Password123</td><td>citizen</td><td>citizen-login.html</td></tr>
<tr><td>fae</td><td>Password123</td><td>dispatch_officer</td><td>dispatch-login.html</td></tr>
<tr><td>dispatch2</td><td>DispatchPass456</td><td>dispatch_officer</td><td>dispatch-login.html</td></tr>
<tr><td>cien</td><td>Password123</td><td>field_officer</td><td>field-login.html</td></tr>
<tr><td>javier</td><td>FieldPass2</td><td>field_officer</td><td>field-login.html</td></tr>
<tr><td>cruz</td><td>FieldPass3</td><td>field_officer</td><td>field-login.html</td></tr>
</table>

<p style="color:red;margin-top:20px">⚠️ <strong>Delete this file after use:</strong> <code>sync_accounts.php</code></p>
</body></html>
