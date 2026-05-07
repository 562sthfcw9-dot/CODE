<?php
require_once __DIR__ . '/helpers.php';

$action = trim((string)($_REQUEST['action'] ?? 'upload_evidence'));
$user   = requireLogin();

if ($action === 'upload_evidence') {
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        errorResponse('No file uploaded or upload error.');
    }

    $file = $_FILES['file'];
    $maxSize = 50 * 1024 * 1024; // 50MB
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];

    if ($file['size'] > $maxSize) {
        errorResponse('File size exceeds 50MB limit.');
    }

    if (!in_array($file['type'], $allowedTypes)) {
        errorResponse('Only JPG, PNG, GIF, WebP, and MP4 files are allowed.');
    }

    // Generate unique filename
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'complaint_' . uniqid() . '.' . $ext;
    $filepath = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        errorResponse('Failed to save file.');
    }

    successResponse([
        'success' => true,
        'filename' => $filename,
        'url' => '../uploads/' . $filename,
        'message' => 'File uploaded successfully.'
    ]);
}

errorResponse('Unknown action.');
?>
