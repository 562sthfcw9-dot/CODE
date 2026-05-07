<?php
require_once __DIR__ . '/helpers.php';

$action = trim((string)($_REQUEST['action'] ?? 'upload_evidence'));
$user   = requireLogin();

if ($action === 'upload_evidence') {
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        errorResponse('No file uploaded or upload error.');
    }

    $file = $_FILES['file'];
    $minSize = 1024; // 1KB
    $maxSize = 50 * 1024 * 1024; // 50MB
    $allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/quicktime', 'video/x-m4v',
    ];
    $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'm4v'];

    if ($file['size'] < $minSize || $file['size'] > $maxSize) {
        errorResponse('File size must be between 1KB and 50MB.');
    }

    $ext = strtolower((string)pathinfo($file['name'], PATHINFO_EXTENSION));
    $mimeAllowed = in_array((string)$file['type'], $allowedTypes, true);
    $extAllowed = in_array($ext, $allowedExts, true);
    if (!$mimeAllowed && !$extAllowed) {
        errorResponse('Only JPG, PNG, GIF, WebP, and MP4 files are allowed.');
    }

    // Generate unique filename
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

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
