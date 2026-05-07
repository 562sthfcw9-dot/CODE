<?php
require_once __DIR__ . '/helpers.php';

$data = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'list'));
$user = requireLogin();
$db = getDb();

function getBarangayCoordinates(string $barangay): array
{
    $lookup = [
        'Commonwealth' => ['lat' => 14.6760, 'lng' => 121.0437],
        'Batasan Hills' => ['lat' => 14.6915, 'lng' => 121.0507],
        'Central' => ['lat' => 14.6390, 'lng' => 121.0100],
        'Sto. Cristo' => ['lat' => 14.6280, 'lng' => 120.9872],
    ];
    return $lookup[$barangay] ?? ['lat' => 14.6760, 'lng' => 121.0437];
}

if ($action === 'list') {
    if ($user['role'] === 'regular') {
        $stmt = $db->prepare('SELECT tracking_number AS id, incident_category AS cat, incident_barangay AS brgy, urgency_priority AS priority, current_progress_status AS status, submission_timestamp AS date, is_reported_anonymously AS anon, incident_description AS description, map_latitude AS lat, map_longitude AS lng FROM traffic_complaints_master WHERE citizen_reporter_id = :id ORDER BY submission_timestamp DESC');
        $stmt->execute([':id' => $user['id']]);
        $complaints = $stmt->fetchAll();
        successResponse(['complaints' => $complaints]);
    }
    errorResponse('Only regular users may query their own complaints.', 403);
}

if ($action === 'timeline') {
    $id = trim((string)($_REQUEST['id'] ?? $data['id'] ?? ''));
    if ($id === '') {
        errorResponse('Complaint ID is required.');
    }
    $stmt = $db->prepare('SELECT status_reached AS status, status_remarks AS remarks, event_timestamp AS time FROM complaint_lifecycle_timeline WHERE tracking_number = :id ORDER BY event_timestamp ASC');
    $stmt->execute([':id' => $id]);
    successResponse(['timeline' => $stmt->fetchAll()]);
}

if ($action === 'submit') {
    if ($user['role'] !== 'regular') {
        errorResponse('Only regular users can submit complaints.', 403);
    }

    $category = trim((string)($data['category'] ?? ''));
    $barangay = trim((string)($data['barangay'] ?? ''));
    $date = trim((string)($data['date'] ?? ''));
    $time = trim((string)($data['time'] ?? ''));
    $description = trim((string)($data['description'] ?? ''));
    $priority = trim((string)($data['priority'] ?? 'medium'));
    $anonymous = isset($data['anonymous']) ? boolval($data['anonymous']) : false;

    if ($category === '' || $barangay === '' || $date === '' || $time === '' || strlen($description) < 50) {
        errorResponse('All complaint fields are required, and description must be at least 50 characters.');
    }

    $pinnedLat = isset($data['lat']) && is_numeric($data['lat']) ? (float)$data['lat'] : null;
    $pinnedLng = isset($data['lng']) && is_numeric($data['lng']) ? (float)$data['lng'] : null;
    $fallback = getBarangayCoordinates($barangay);
    $coords = [
        'lat' => $pinnedLat ?? $fallback['lat'],
        'lng' => $pinnedLng ?? $fallback['lng'],
    ];
    $trackingNumber = buildTrackingNumber($db);
    $dateField = date('Y-m-d H:i:s', strtotime($date . ' ' . $time));

    $stmt = $db->prepare('INSERT INTO traffic_complaints_master (tracking_number, citizen_reporter_id, incident_category, incident_barangay, urgency_priority, current_progress_status, incident_description, is_reported_anonymously, map_latitude, map_longitude, submission_timestamp) VALUES (:tracking, :citizen_id, :category, :barangay, :priority, :status, :description, :anon, :lat, :lng, NOW())');
    $stmt->execute([
        ':tracking' => $trackingNumber,
        ':citizen_id' => $user['id'],
        ':category' => $category,
        ':barangay' => $barangay,
        ':priority' => $priority,
        ':status' => 'submitted',
        ':description' => $description,
        ':anon' => $anonymous ? 1 : 0,
        ':lat' => $coords['lat'],
        ':lng' => $coords['lng'],
    ]);

    $stmt = $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)');
    $stmt->execute([':tracking' => $trackingNumber, ':status' => 'submitted', ':remarks' => 'Complaint submitted by user.']);

    $duplicates = [];
    $dupStmt = $db->prepare('SELECT tracking_number, map_latitude AS lat, map_longitude AS lng, submission_timestamp FROM traffic_complaints_master WHERE submission_timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND tracking_number != :tracking');
    $dupStmt->execute([':tracking' => $trackingNumber]);
    while ($row = $dupStmt->fetch()) {
        $distance = getDistanceMeters((float)$coords['lat'], (float)$coords['lng'], (float)$row['lat'], (float)$row['lng']);
        if ($distance <= 100) {
            $duplicates[] = ['tracking_number' => $row['tracking_number'], 'distance_m' => round($distance, 2), 'submitted_at' => $row['submission_timestamp']];
            $ins = $db->prepare('INSERT IGNORE INTO duplicate_complaint_detection (primary_complaint_tracking_number, duplicate_complaint_tracking_number, distance_meters, time_difference_hours) VALUES (:primary, :duplicate, :distance, :hours)');
            $ins->execute([
                ':primary' => $trackingNumber,
                ':duplicate' => $row['tracking_number'],
                ':distance' => $distance,
                ':hours' => 0,
            ]);
        }
    }

    successResponse(['tracking_number' => $trackingNumber, 'duplicates' => $duplicates]);
}

if ($action === 'cancel') {
    if ($user['role'] !== 'regular') {
        errorResponse('Only regular users can cancel complaints.', 403);
    }

    $id = trim((string)($data['id'] ?? ''));
    if ($id === '') {
        errorResponse('Complaint ID is required.');
    }

    $stmt = $db->prepare('SELECT current_progress_status FROM traffic_complaints_master WHERE tracking_number = :id AND citizen_reporter_id = :user_id');
    $stmt->execute([':id' => $id, ':user_id' => $user['id']]);
    $status = $stmt->fetchColumn();

    if (!$status) {
        errorResponse('Complaint not found.');
    }
    if ($status !== 'submitted') {
        errorResponse('Only complaints that are still submitted may be cancelled.');
    }

    $update = $db->prepare('UPDATE traffic_complaints_master SET current_progress_status = :status WHERE tracking_number = :id');
    $update->execute([':status' => 'cancelled', ':id' => $id]);

    $stmt = $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)');
    $stmt->execute([':tracking' => $id, ':status' => 'cancelled', ':remarks' => 'User cancelled the complaint before verification.']);

    successResponse(['message' => 'Complaint cancelled successfully.']);
}

if ($action === 'rate') {
    if ($user['role'] !== 'regular') {
        errorResponse('Only regular users may rate completed cases.', 403);
    }

    $id = trim((string)($data['id'] ?? ''));
    $rating = intval($data['rating'] ?? 0);
    $comment = trim((string)($data['comment'] ?? ''));

    if ($id === '' || $rating < 1 || $rating > 5) {
        errorResponse('A valid complaint ID and rating are required.');
    }

    $stmt = $db->prepare('SELECT current_progress_status FROM traffic_complaints_master WHERE tracking_number = :id AND citizen_reporter_id = :user_id');
    $stmt->execute([':id' => $id, ':user_id' => $user['id']]);
    $status = $stmt->fetchColumn();

    if (!in_array($status, ['closed', 'resolved'], true)) {
        errorResponse('Only closed or resolved cases may be rated.');
    }

    $update = $db->prepare('UPDATE traffic_complaints_master SET citizen_feedback_rating = :rating, citizen_feedback_comment = :comment, feedback_submitted_at = NOW() WHERE tracking_number = :id');
    $update->execute([':rating' => $rating, ':comment' => $comment, ':id' => $id]);

    successResponse(['message' => 'Thank you for your rating.']);
}

errorResponse('Unknown action.');
