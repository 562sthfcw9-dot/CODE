<?php
require_once __DIR__ . '/init.php';

$user = requireRole('regular');
$data = getJsonPayload();

$firstName = trim((string)($data['firstName'] ?? ''));
$lastName  = trim((string)($data['lastName'] ?? ''));
$email     = trim((string)($data['email'] ?? ''));
$message   = trim((string)($data['message'] ?? ''));

if ($firstName === '' || $lastName === '' || $email === '' || $message === '') {
    errorResponse('Please complete all feedback fields.');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    errorResponse('Please enter a valid email address.');
}

if (strlen($message) < 10) {
    errorResponse('Please provide a more detailed message.');
}

$to = 'cartallaanny@gmail.com';
$fullName = trim($firstName . ' ' . $lastName);
$subject = 'TRAPICO Citizen Feedback - ' . $fullName;

$senderName = trim((string)($user['name'] ?? $fullName));
$senderRole = trim((string)($user['role'] ?? 'regular'));
$senderId   = (string)($user['id'] ?? '');

$host = trim((string)($_SERVER['HTTP_HOST'] ?? 'trapico.local'));
$host = preg_replace('/[^a-zA-Z0-9.\-]/', '', $host) ?: 'trapico.local';

$body = "TRAPICO Citizen Feedback\n"
      . "========================\n\n"
      . "Name: {$fullName}\n"
      . "Email: {$email}\n"
      . "Submitted By: {$senderName}\n"
      . "User Role: {$senderRole}\n"
      . "User Ref ID: {$senderId}\n"
      . "Submitted At: " . date('Y-m-d H:i:s') . "\n\n"
      . "Message:\n{$message}\n";

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    "From: TRAPICO Feedback <no-reply@{$host}>",
    "Reply-To: {$email}",
];

function sendViaFormSubmit(string $toEmail, string $subjectLine, string $senderName, string $senderEmail, string $messageBody, string $originHost): array
{
    if (!function_exists('curl_init')) {
        return ['sent' => false, 'message' => 'cURL extension is not available.'];
    }

    $payload = [
        'name' => $senderName,
        'email' => $senderEmail,
        'message' => $messageBody,
        '_subject' => $subjectLine,
        '_captcha' => 'false',
    ];

    $ch = curl_init('https://formsubmit.co/ajax/' . rawurlencode($toEmail));
    if ($ch === false) {
        return ['sent' => false, 'message' => 'Unable to initialize relay request.'];
    }

    $origin = 'http://' . $originHost;
    $referer = $origin . '/Trapico/CODE/CITIZEN/civilian.html';

    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Origin: ' . $origin,
        'Referer: ' . $referer,
        'User-Agent: TRAPICO-Feedback/1.0',
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
        return ['sent' => false, 'message' => 'Relay service returned an invalid response.'];
    }

    $ok = (($json['success'] ?? '') === 'true' || ($json['success'] ?? false) === true);
    if ($ok) {
        return ['sent' => true, 'message' => 'Feedback sent successfully.'];
    }

    $msg = trim((string)($json['message'] ?? 'Relay service rejected the submission.'));
    return ['sent' => false, 'message' => $msg];
}

function queueFeedbackLocally(string $subjectLine, string $messageBody, string $senderEmail): bool
{
    $dir = __DIR__ . '/../uploads/feedback';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }

    $row = [
        'queued_at' => date('c'),
        'subject' => $subjectLine,
        'sender_email' => $senderEmail,
        'message' => $messageBody,
    ];

    $file = $dir . '/feedback-' . date('Y-m-d') . '.log';
    return @file_put_contents($file, json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX) !== false;
}

$relay = sendViaFormSubmit($to, $subject, $fullName, $email, $body, $host);
$sent = (bool)($relay['sent'] ?? false);
$relayMessage = trim((string)($relay['message'] ?? ''));

if (!$sent) {
    $sent = @mail($to, $subject, $body, implode("\r\n", $headers));
}

if ($sent) {
    successResponse(['message' => 'Feedback sent successfully.']);
}

$queued = queueFeedbackLocally($subject, $body, $email);
if ($queued) {
    $queueMsg = 'Feedback received and queued for TTMD.';
    if ($relayMessage !== '') {
        $queueMsg .= ' Delivery note: ' . $relayMessage;
    }
    successResponse(['message' => $queueMsg]);
}

errorResponse('Unable to send feedback right now. Please contact support.', 500);
