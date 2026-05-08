<?php
require_once __DIR__ . '/init.php';

$data = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? ''));

if ($action === '') {
    errorResponse('Missing action.');
}

$db = getDb();

function roleToUserRole(string $role): string
{
    if ($role === 'regular') return 'citizen';
    if ($role === 'dispatch') return 'dispatch_officer';
    if ($role === 'field') return 'field_officer';
    return '';
}

function userRoleToPublic(string $userRole): string
{
    if ($userRole === 'citizen') return 'regular';
    if ($userRole === 'dispatch_officer') return 'dispatch';
    if ($userRole === 'field_officer') return 'field';
    return '';
}

function roleLoginPath(string $role): string
{
    if ($role === 'regular') return 'citizen-login.html';
    if ($role === 'dispatch') return 'dispatch-login.html';
    if ($role === 'field') return 'field-login.html';
    return 'index.html';
}

function buildResetPath(string $role, string $token): string
{
    $query = http_build_query([
        'token' => $token,
        'role' => $role,
    ]);
    return 'reset-password.html?' . $query;
}

function isLoopbackHost(string $host): bool
{
    $h = strtolower(trim($host));
    return $h === '' || $h === 'localhost' || $h === '127.0.0.1' || $h === '::1';
}

function isPrivateIpv4(string $ip): bool
{
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        return false;
    }
    return (bool)preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/', $ip);
}

function resolveMobileHost(string $requestUrl = ''): string
{
    $candidates = [];

    if ($requestUrl !== '') {
        $parts = @parse_url($requestUrl);
        $reqHost = strtolower(trim((string)($parts['host'] ?? '')));
        if ($reqHost !== '') {
            $candidates[] = $reqHost;
        }
    }

    $httpHost = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
    $httpHost = preg_replace('/:\d+$/', '', $httpHost);
    if ($httpHost !== '') {
        $candidates[] = $httpHost;
    }

    $serverAddr = strtolower(trim((string)($_SERVER['SERVER_ADDR'] ?? '')));
    if ($serverAddr !== '') {
        $candidates[] = $serverAddr;
    }

    $localAddr = strtolower(trim((string)($_SERVER['LOCAL_ADDR'] ?? '')));
    if ($localAddr !== '') {
        $candidates[] = $localAddr;
    }

    $hostIp = @gethostbyname((string)@gethostname());
    if (is_string($hostIp) && $hostIp !== '') {
        $candidates[] = strtolower(trim($hostIp));
    }

    foreach ($candidates as $candidate) {
        if ($candidate === '' || isLoopbackHost($candidate)) {
            continue;
        }
        if (filter_var($candidate, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            if (isPrivateIpv4($candidate)) {
                return $candidate;
            }
            continue;
        }
        return $candidate;
    }

    return '';
}

function buildMobileResetLink(string $link, string $requestUrl = ''): string
{
    $parts = @parse_url($link);
    if (!is_array($parts) || empty($parts['host'])) {
        return $link;
    }

    $origHost = strtolower(trim((string)$parts['host']));
    if (!isLoopbackHost($origHost)) {
        return $link;
    }

    $mobileHost = resolveMobileHost($requestUrl);
    if ($mobileHost === '') {
        return $link;
    }

    $scheme = trim((string)($parts['scheme'] ?? 'http'));
    $path = trim((string)($parts['path'] ?? '/'));
    $query = trim((string)($parts['query'] ?? ''));
    $fragment = trim((string)($parts['fragment'] ?? ''));

    $port = isset($parts['port']) ? (int)$parts['port'] : 0;
    if ($port <= 0 && $requestUrl !== '') {
        $requestParts = @parse_url($requestUrl);
        $port = isset($requestParts['port']) ? (int)$requestParts['port'] : 0;
    }
    $portSuffix = ($port > 0 && $port !== 80 && $port !== 443) ? ':' . $port : '';

    $rebuilt = $scheme . '://' . $mobileHost . $portSuffix . $path;
    if ($query !== '') {
        $rebuilt .= '?' . $query;
    }
    if ($fragment !== '') {
        $rebuilt .= '#' . $fragment;
    }
    return $rebuilt;
}

function buildResetLink(string $role, string $token, string $requestUrl = ''): string
{
    if ($requestUrl !== '') {
        $parts = @parse_url($requestUrl);
        $scheme = (!empty($parts['scheme']) && in_array(strtolower((string)$parts['scheme']), ['http', 'https'], true))
            ? strtolower((string)$parts['scheme'])
            : ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');
        $host = trim((string)($parts['host'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost'));
        $port = isset($parts['port']) ? (int)$parts['port'] : 0;
        $path = trim((string)($parts['path'] ?? ''));

        $basePath = dirname($path);
        if ($basePath === '\\' || $basePath === '/' || $basePath === '.') {
            $basePath = '';
        }

        $portSuffix = ($port > 0 && $port !== 80 && $port !== 443) ? ':' . $port : '';
        $query = http_build_query([
            'token' => $token,
            'role' => $role,
        ]);

        return $scheme . '://' . $host . $portSuffix . $basePath . '/reset-password.html?' . $query;
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scheme = $https ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));

    $script = (string)($_SERVER['SCRIPT_NAME'] ?? '/api/password_reset.php');
    $base = dirname(dirname($script));
    if ($base === '\\' || $base === '/') {
        $base = '';
    }

    $query = http_build_query([
        'token' => $token,
        'role' => $role,
    ]);

    return $scheme . '://' . $host . $base . '/reset-password.html?' . $query;
}

function sendResetEmail(string $to, string $name, string $link, string $accountDetails = '', string $localPath = '', string $mobileLink = ''): bool
{
    $subject = 'TRAPICO Password Reset Link';
    $detailsLine = $accountDetails !== '' ? "Account Details: {$accountDetails}\n" : '';
    $body = "Hello {$name},\n\n"
        . "A password reset request was made for your TRAPICO account.\n"
        . $detailsLine
        . "Click this link to set a new password:\n\n"
        . $link . "\n\n"
        . ($mobileLink !== '' && $mobileLink !== $link ? "For phone access, use this mobile link:\n{$mobileLink}\n\n" : '')
        . ($localPath !== '' ? "If the link above cannot be reached, open TRAPICO then use this path:\n{$localPath}\n\n" : '')
        . "This link expires in 30 minutes.\n"
        . "If you did not request this, you can ignore this email.\n\n"
        . "- TRAPICO System";

    $host = trim((string)($_SERVER['HTTP_HOST'] ?? 'trapico.local'));
    $host = preg_replace('/[^a-zA-Z0-9.\-]/', '', $host) ?: 'trapico.local';

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        "From: TRAPICO Support <no-reply@{$host}>",
        'Reply-To: no-reply@' . $host,
    ];

    return @mail($to, $subject, $body, implode("\r\n", $headers));
}

function sendResetViaFormSubmit(string $toEmail, string $name, string $link, string $originHost, string $accountDetails = '', string $localPath = '', string $mobileLink = ''): array
{
    if (!function_exists('curl_init')) {
        return ['sent' => false, 'message' => 'cURL extension is not available.'];
    }

    $detailsLine = $accountDetails !== '' ? "\nAccount Details: {$accountDetails}\n" : "\n";
    $payload = [
        'name' => 'TRAPICO Password Recovery',
        'email' => 'no-reply@' . preg_replace('/[^a-zA-Z0-9.\-]/', '', $originHost),
        'message' => "Hello {$name},\n\nUse this link to reset your password:\n{$link}{$detailsLine}" . (($mobileLink !== '' && $mobileLink !== $link) ? "For phone access, use this mobile link:\n{$mobileLink}\n\n" : "") . ($localPath !== '' ? "If link cannot be reached, open TRAPICO and use this path:\n{$localPath}\n\n" : "") . "This link expires in 30 minutes.\n- TRAPICO",
        '_subject' => 'TRAPICO Password Reset Link',
        '_captcha' => 'false',
    ];

    $origin = 'http://' . $originHost;
    $referer = $origin . '/citizen-login.html';

    $ch = curl_init('https://formsubmit.co/ajax/' . rawurlencode($toEmail));
    if ($ch === false) {
        return ['sent' => false, 'message' => 'Unable to initialize relay request.'];
    }

    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Origin: ' . $origin,
        'Referer: ' . $referer,
        'User-Agent: TRAPICO-PasswordReset/1.0',
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));

    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($resp === false || $http < 200 || $http >= 300) {
        return ['sent' => false, 'message' => 'Relay service request failed.'];
    }

    $json = json_decode($resp, true);
    if (!is_array($json)) {
        return ['sent' => false, 'message' => 'Relay returned invalid response.'];
    }

    $ok = (($json['success'] ?? '') === 'true' || ($json['success'] ?? false) === true);
    if ($ok) {
        return ['sent' => true, 'message' => 'Reset email sent successfully.'];
    }

    return ['sent' => false, 'message' => trim((string)($json['message'] ?? 'Relay rejected the submission.'))];
}

function queueResetRequest(string $role, string $email, string $link, string $note = ''): bool
{
    $dir = __DIR__ . '/../uploads/reset-queue';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }

    $row = [
        'queued_at' => date('c'),
        'role' => $role,
        'email' => $email,
        'reset_link' => $link,
        'note' => $note,
    ];

    $file = $dir . '/reset-' . date('Y-m-d') . '.log';
    return @file_put_contents($file, json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX) !== false;
}

function isLocalDevRequest(): bool
{
    $host = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '')));
    $host = preg_replace('/:\d+$/', '', $host);
    if ($host === '' || $host === 'localhost' || $host === '127.0.0.1') {
        return true;
    }

    if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        if (preg_match('/^10\./', $host)) return true;
        if (preg_match('/^192\.168\./', $host)) return true;
        if (preg_match('/^172\.(1[6-9]|2\d|3[0-1])\./', $host)) return true;
    }

    return false;
}

function maskEmail(string $email): string
{
    $email = trim($email);
    if ($email === '' || strpos($email, '@') === false) {
        return 'hidden';
    }

    [$local, $domain] = explode('@', $email, 2);
    $localLen = strlen($local);
    if ($localLen <= 2) {
        $maskedLocal = str_repeat('*', max(1, $localLen));
    } else {
        $maskedLocal = substr($local, 0, 2) . str_repeat('*', max(1, $localLen - 2));
    }

    return $maskedLocal . '@' . $domain;
}

if ($action === 'requestReset') {
    $role = trim((string)($data['role'] ?? ''));
    $identifier = trim((string)($data['identifier'] ?? ''));
    $requestUrl = trim((string)($data['requestUrl'] ?? ''));

    if ($identifier === '') {
        errorResponse('Please enter your username or email address.');
    }

    $roleUser = roleToUserRole($role);
    if ($roleUser === '') {
        errorResponse('Invalid role selected.');
    }

    $user = null;
    if ($role === 'field') {
        $stmt = $db->prepare(
                        'SELECT u.user_id, u.email, u.full_name, u.username, f.badge_number AS officer_badge
             FROM Users u
             LEFT JOIN Field_officers f ON f.user_id = u.user_id
             WHERE u.role = :role AND u.is_active = 1
               AND (u.username = :id1 OR u.email = :id2 OR f.badge_number = :id3)
             LIMIT 1'
        );
        $stmt->execute([':role' => $roleUser, ':id1' => $identifier, ':id2' => $identifier, ':id3' => $identifier]);
        $user = $stmt->fetch();
    } elseif ($role === 'dispatch') {
        $stmt = $db->prepare(
            'SELECT u.user_id, u.email, u.full_name, u.username, d.badge_number AS officer_badge
             FROM Users u
             LEFT JOIN Dispatch_officers d ON d.user_id = u.user_id
             WHERE u.role = :role AND u.is_active = 1
               AND (u.email = :id1 OR d.badge_number = :id2)
             LIMIT 1'
        );
        $stmt->execute([':role' => $roleUser, ':id1' => $identifier, ':id2' => $identifier]);
        $user = $stmt->fetch();
    } else {
        $stmt = $db->prepare(
            'SELECT user_id, email, full_name, username, NULL AS officer_badge
             FROM Users
             WHERE role = :role AND is_active = 1 AND (username = :id1 OR email = :id2)
             LIMIT 1'
        );
        $stmt->execute([':role' => $roleUser, ':id1' => $identifier, ':id2' => $identifier]);
        $user = $stmt->fetch();
    }

    // Privacy-preserving response for unknown account.
    if (!$user || empty($user['email'])) {
        successResponse(['message' => 'If the account exists, a reset link has been sent to its registered email.']);
    }

    $storedEmail = strtolower(trim((string)$user['email']));
    if (str_ends_with($storedEmail, '@trapico.local')) {
        errorResponse('This account has no real email configured yet. Please update your email in profile settings, then request reset again.');
    }

    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);

    $db->prepare('UPDATE Users SET reset_token = :token, reset_token_expires = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE user_id = :uid')
       ->execute([':token' => $tokenHash, ':uid' => (int)$user['user_id']]);

    $link = buildResetLink($role, $token, $requestUrl);
    $mobileLink = buildMobileResetLink($link, $requestUrl);
    $localResetPath = buildResetPath($role, $token);
    $recipientEmail = (string)$user['email'];
    $recipientName = trim((string)($user['full_name'] ?? 'User'));
    $maskedRecipient = maskEmail($recipientEmail);
    $username = trim((string)($user['username'] ?? ''));
    $officerBadge = trim((string)($user['officer_badge'] ?? ''));
    $accountDetails = 'Role=' . $role . ($username !== '' ? ', Username=' . $username : '') . ($officerBadge !== '' ? ', FieldOfficerID=' . $officerBadge : '');

    $sent = sendResetEmail($recipientEmail, $recipientName, $link, $accountDetails, $localResetPath, $mobileLink);
    $relayNote = '';

    if (!$sent) {
        $relay = sendResetViaFormSubmit($recipientEmail, $recipientName, $link, (string)($_SERVER['HTTP_HOST'] ?? 'localhost'), $accountDetails, $localResetPath, $mobileLink);
        $sent = (bool)($relay['sent'] ?? false);
        $relayNote = trim((string)($relay['message'] ?? ''));
    }

    if ($sent) {
        $response = [
            'message' => 'Password reset link sent to ' . $maskedRecipient . '. Please check your email inbox.',
            'deliveryStatus' => 'sent',
        ];
        // On local/LAN setups, email delivery can be delayed. Return immediate link so reset is never blocked.
        if (isLocalDevRequest()) {
            $response['resetLink'] = $link;
            $response['mobileResetLink'] = $mobileLink;
            $response['resetPath'] = $localResetPath;
            $response['targetEmail'] = $recipientEmail;
            $response['matchedRole'] = $role;
            $response['matchedUsername'] = $username;
            $response['matchedFieldOfficerId'] = $officerBadge;
        }
        successResponse($response);
    }

    $queued = queueResetRequest($role, $recipientEmail, $link, $relayNote);
    if ($queued) {
        $msg = 'Reset request received. Delivery is being retried by the server. Please check your email shortly.';
        if ($relayNote !== '') {
            $msg .= ' Note: ' . $relayNote;
        }
        $deliveryStatus = (stripos($relayNote, 'activation') !== false) ? 'activation_required' : 'queued';
        $response = ['message' => $msg . ' Target mailbox: ' . $maskedRecipient . '.', 'deliveryStatus' => $deliveryStatus];
        // On private/local hosts, expose the generated link so password reset can continue even when email transport is unavailable.
        if (isLocalDevRequest()) {
            $response['resetLink'] = $link;
            $response['mobileResetLink'] = $mobileLink;
            $response['resetPath'] = $localResetPath;
            $response['targetEmail'] = $recipientEmail;
            $response['matchedRole'] = $role;
            $response['matchedUsername'] = $username;
            $response['matchedFieldOfficerId'] = $officerBadge;
        }
        successResponse($response);
    }

    errorResponse('Unable to process reset request right now. Please try again later.', 500);
}

if ($action === 'validateToken') {
    $role = trim((string)($data['role'] ?? ''));
    $token = trim((string)($data['token'] ?? ''));
    if ($token === '') {
        errorResponse('Missing reset token.');
    }

    $tokenHash = hash('sha256', $token);
    $stmt = $db->prepare(
        'SELECT user_id, role
         FROM Users
         WHERE reset_token = :token AND reset_token_expires IS NOT NULL AND reset_token_expires >= NOW() AND is_active = 1
         LIMIT 1'
    );
    $stmt->execute([':token' => $tokenHash]);
    $row = $stmt->fetch();
    if (!$row) {
        errorResponse('This reset link is invalid or has expired.');
    }

    if ($role !== '') {
        $expected = roleToUserRole($role);
        if ($expected !== '' && $row['role'] !== $expected) {
            errorResponse('This reset link does not match the requested role.');
        }
    }

    successResponse(['message' => 'Reset token is valid.']);
}

if ($action === 'resetPassword') {
    $role = trim((string)($data['role'] ?? ''));
    $token = trim((string)($data['token'] ?? ''));
    $newPassword = trim((string)($data['newPassword'] ?? ''));

    if ($token === '' || $newPassword === '') {
        errorResponse('Missing token or new password.');
    }

    if (strlen($newPassword) < 8 || !preg_match('/[A-Z]/', $newPassword) || !preg_match('/\d/', $newPassword)) {
        errorResponse('Password must be at least 8 characters and include 1 uppercase and 1 number.');
    }

    $tokenHash = hash('sha256', $token);
    $stmt = $db->prepare(
        'SELECT user_id, role
         FROM Users
         WHERE reset_token = :token AND reset_token_expires IS NOT NULL AND reset_token_expires >= NOW() AND is_active = 1
         LIMIT 1'
    );
    $stmt->execute([':token' => $tokenHash]);
    $row = $stmt->fetch();
    if (!$row) {
        errorResponse('This reset link is invalid or has expired.');
    }

    if ($role !== '') {
        $expected = roleToUserRole($role);
        if ($expected !== '' && $row['role'] !== $expected) {
            errorResponse('This reset link does not match the requested role.');
        }
    }

    $hash = hashPassword($newPassword);
    $db->prepare('UPDATE Users SET password_hash = :hash, reset_token = NULL, reset_token_expires = NULL, failed_login_attempts = 0, locked_until = NULL WHERE user_id = :uid')
       ->execute([':hash' => $hash, ':uid' => (int)$row['user_id']]);

    $updatedRole = userRoleToPublic((string)($row['role'] ?? ''));
    successResponse([
        'message' => 'Password has been reset successfully.',
        'loginPath' => roleLoginPath($updatedRole !== '' ? $updatedRole : $role),
        'updatedRole' => $updatedRole !== '' ? $updatedRole : $role,
    ]);
}

errorResponse('Unknown action.');
