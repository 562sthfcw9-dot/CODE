<?php
require_once __DIR__ . '/helpers.php';

$data = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'thread'));
$user = requireLogin();
$db = getDb();

function ensureChatMessagesTable(PDO $db): void
{
    $db->exec(
        'CREATE TABLE IF NOT EXISTS chat_messages (
            message_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            conversation_key VARCHAR(128) NOT NULL,
            sender_role VARCHAR(32) NOT NULL,
            sender_id INT UNSIGNED NOT NULL,
            receiver_role VARCHAR(32) NOT NULL,
            receiver_id INT UNSIGNED NOT NULL,
            message_text TEXT NOT NULL,
            sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_conversation (conversation_key, message_id),
            INDEX idx_sender (sender_role, sender_id),
            INDEX idx_receiver (receiver_role, receiver_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function buildConversationKey(string $roleA, string $idA, string $roleB, string $idB): string
{
    if ($roleA < $roleB) {
        return sprintf('%s:%s|%s:%s', $roleA, $idA, $roleB, $idB);
    }
    return sprintf('%s:%s|%s:%s', $roleB, $idB, $roleA, $idA);
}

ensureChatMessagesTable($db);

$currentKey = '';
$receiverRole = trim((string)($data['receiver_role'] ?? $_REQUEST['receiver_role'] ?? ''));
$receiverId = trim((string)($data['receiver_id'] ?? $_REQUEST['receiver_id'] ?? ''));
if ($receiverRole !== '' && $receiverId !== '') {
    $currentKey = buildConversationKey($user['role'], (string)$user['id'], $receiverRole, $receiverId);
}

if ($action === 'send') {
    $message = trim((string)($data['message'] ?? ''));
    if ($message === '' || $receiverRole === '' || $receiverId === '') {
        errorResponse('Message text, receiver role, and receiver ID are required.');
    }

    $conversationKey = buildConversationKey($user['role'], (string)$user['id'], $receiverRole, $receiverId);
    $stmt = $db->prepare('INSERT INTO chat_messages (conversation_key, sender_role, sender_id, receiver_role, receiver_id, message_text) VALUES (:key, :sender_role, :sender_id, :receiver_role, :receiver_id, :message)');
    $stmt->execute([':key' => $conversationKey, ':sender_role' => $user['role'], ':sender_id' => $user['id'], ':receiver_role' => $receiverRole, ':receiver_id' => $receiverId, ':message' => $message]);

    successResponse(['message' => 'Message sent successfully.', 'conversation_key' => $conversationKey]);
}

if ($action === 'poll') {
    if ($currentKey === '') {
        errorResponse('A conversation key is required.');
    }
    $lastId = intval($data['last_id'] ?? $_REQUEST['last_id'] ?? 0);
    $stmt = $db->prepare('SELECT message_id AS id, sender_role AS senderRole, sender_id AS senderId, receiver_role AS receiverRole, receiver_id AS receiverId, message_text AS message, sent_at AS sentAt FROM chat_messages WHERE conversation_key = :key AND message_id > :last_id ORDER BY message_id ASC');
    $stmt->execute([':key' => $currentKey, ':last_id' => $lastId]);
    successResponse(['messages' => $stmt->fetchAll()]);
}

if ($action === 'thread') {
    if ($currentKey === '') {
        errorResponse('A conversation key is required.');
    }
    $stmt = $db->prepare('SELECT message_id AS id, sender_role AS senderRole, sender_id AS senderId, receiver_role AS receiverRole, receiver_id AS receiverId, message_text AS message, sent_at AS sentAt FROM chat_messages WHERE conversation_key = :key ORDER BY message_id ASC');
    $stmt->execute([':key' => $currentKey]);
    successResponse(['messages' => $stmt->fetchAll()]);
}

errorResponse('Unknown action.');
