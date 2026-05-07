<?php
require_once __DIR__ . '/helpers.php';

$data   = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'list'));
$user   = requireLogin();
$db     = getDb();

function getBarangayCoordinates(string $barangay): array
{
    $lookup = [
        'Commonwealth' => ['lat' => 14.6760, 'lng' => 121.0437],
        'Batasan Hills' => ['lat' => 14.6915, 'lng' => 121.0507],
        'Central'       => ['lat' => 14.6390, 'lng' => 121.0100],
        'Sto. Cristo'   => ['lat' => 14.6280, 'lng' => 120.9872],
    ];
    return $lookup[$barangay] ?? ['lat' => 14.6760, 'lng' => 121.0437];
}

if ($action === 'list') {
    if ($user['role'] === 'regular') {
        $userId = (int)($user['user_id'] ?? $user['id'] ?? 0);
        $stmt = $db->prepare(
            'SELECT tracking_id AS id, category AS cat, asset_town AS brgy, priority,
                    status, submitted_at AS date, is_anonymous AS anon,
                    description, latitude AS lat, longitude AS lng
             FROM Complaints
             WHERE user_id = :uid
             ORDER BY submitted_at DESC'
        );
        $stmt->execute([':uid' => $userId]);
        successResponse(['complaints' => $stmt->fetchAll()]);
    }
    errorResponse('Only regular users may query their own complaints.', 403);
}

if ($action === 'timeline') {
    $id = trim((string)($_REQUEST['id'] ?? $data['id'] ?? ''));
    if ($id === '') {
        errorResponse('Complaint ID is required.');
    }
    $stmt = $db->prepare(
        'SELECT sh.status, sh.notes AS remarks, sh.changed_at AS time
         FROM Status_history sh
         JOIN Complaints c ON c.complaint_id = sh.complaint_id
         WHERE c.tracking_id = :id
         ORDER BY sh.changed_at ASC'
    );
    $stmt->execute([':id' => $id]);
    successResponse(['timeline' => $stmt->fetchAll()]);
}

if ($action === 'submit') {
    if ($user['role'] !== 'regular') {
        errorResponse('Only regular users can submit complaints.', 403);
    }

    $category    = trim((string)($data['category'] ?? ''));
    $barangay    = trim((string)($data['barangay'] ?? ''));
    $address     = trim((string)($data['address'] ?? ''));
    $date        = trim((string)($data['date'] ?? ''));
    $time        = trim((string)($data['time'] ?? ''));
    $description = trim((string)($data['description'] ?? ''));
    $priority    = trim((string)($data['priority'] ?? 'medium'));
    $anonymous   = isset($data['anonymous']) ? boolval($data['anonymous']) : false;
    $media       = $data['media'] ?? null;

    if ($category === '' || $barangay === '' || $address === '' || $date === '' || $time === '' || strlen($description) < 50) {
        errorResponse('All complaint fields are required (min 50 characters for description).');
    }
    if (!is_array($media) || count($media) === 0) {
        errorResponse('At least one evidence file is required before submitting a complaint.');
    }
    if (count($media) > 3) {
        errorResponse('You can upload up to 3 evidence files only.');
    }

    $pinnedLat = isset($data['lat']) && is_numeric($data['lat']) ? (float)$data['lat'] : null;
    $pinnedLng = isset($data['lng']) && is_numeric($data['lng']) ? (float)$data['lng'] : null;
    $fallback  = getBarangayCoordinates($barangay);
    $coords    = ['lat' => $pinnedLat ?? $fallback['lat'], 'lng' => $pinnedLng ?? $fallback['lng']];

    $trackingId = buildTrackingNumber($db);
    $dateField  = date('Y-m-d H:i:s', strtotime($date . ' ' . $time));

    $firstMedia = $media[0] ?? null;
    $capturedAt = trim((string)($firstMedia['captured_at'] ?? ''));
    if ($capturedAt !== '') {
        $capturedTs = strtotime($capturedAt);
        if ($capturedTs !== false) {
            $dateField = date('Y-m-d H:i:s', $capturedTs);
        }
    }
    $userId     = (int)($user['user_id'] ?? $user['id'] ?? 0);

    // Check for duplicate from same user with same category and similar description
    $dupCheckStmt = $db->prepare(
        'SELECT complaint_id, tracking_id FROM Complaints
         WHERE user_id = :uid 
           AND category = :cat
           AND description = :desc
           AND status NOT IN ("cancelled", "rejected")
           AND submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );
    $dupCheckStmt->execute([':uid' => $userId, ':cat' => $category, ':desc' => $description]);
    if ($dupCheckStmt->fetch()) {
        errorResponse('You have already filed a complaint with this exact category and description within the past 7 days. Please submit a different complaint or wait for the existing one to be resolved.');
    }

    $stmt = $db->prepare(
        'INSERT INTO Complaints (user_id, tracking_id, category, asset_town, address, priority, status,
         description, is_anonymous, latitude, longitude, incident_datetime)
         VALUES (:uid, :tracking, :cat, :brgy, :address, :priority, :status, :desc, :anon, :lat, :lng, :datetime)'
    );
    $stmt->execute([
        ':uid'      => $userId,
        ':tracking' => $trackingId,
        ':cat'      => $category,
        ':brgy'     => $barangay,
        ':address'  => $address,
        ':priority' => $priority,
        ':status'   => 'submitted',
        ':desc'     => $description,
        ':anon'     => $anonymous ? 1 : 0,
        ':lat'      => $coords['lat'],
        ':lng'      => $coords['lng'],
        ':datetime' => $dateField,
    ]);
    $newComplaintId = (int)$db->lastInsertId();

    $db->prepare('INSERT INTO Status_history (complaint_id, changed_by, status, notes) VALUES (:cid, :uid, :status, :notes)')
       ->execute([':cid' => $newComplaintId, ':uid' => $userId, ':status' => 'submitted', ':notes' => 'Complaint submitted by user.']);

    // Insert media files if provided
    if (!empty($media) && is_array($media)) {
        $mediaStmt = $db->prepare(
            'INSERT INTO Media (complaint_id, file_url, file_type, uploaded_by_role)
             VALUES (:cid, :url, :type, :role)'
        );
        foreach ($media as $mediaRow) {
            $fileUrl = $mediaRow['url'] ?? $mediaRow['filename'] ?? '';
            if ($fileUrl !== '') {
                $fileType = strpos((string)($mediaRow['type'] ?? ''), 'video') !== false ? 'video' : 'photo';
                $mediaStmt->execute([
                    ':cid' => $newComplaintId,
                    ':url' => $fileUrl,
                    ':type' => $fileType,
                    ':role' => 'citizen'
                ]);
            }
        }
    }

    $duplicates = [];
    $dupStmt = $db->prepare(
        'SELECT complaint_id, tracking_id, latitude AS lat, longitude AS lng, submitted_at
         FROM Complaints
         WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
           AND complaint_id != :cid
           AND status NOT IN ("cancelled")'
    );
    $dupStmt->execute([':cid' => $newComplaintId]);
    while ($row = $dupStmt->fetch()) {
        $distance = getDistanceMeters((float)$coords['lat'], (float)$coords['lng'], (float)$row['lat'], (float)$row['lng']);
        if ($distance <= 100) {
            $duplicates[] = ['tracking_number' => $row['tracking_id'], 'distance_m' => round($distance, 2), 'submitted_at' => $row['submitted_at']];
            $db->prepare(
                'INSERT IGNORE INTO duplicate_complaint_detection (primary_complaint_id, duplicate_complaint_id, distance_meters, time_difference_hours)
                 VALUES (:primary, :dup, :dist, :hrs)'
            )->execute([':primary' => $newComplaintId, ':dup' => $row['complaint_id'], ':dist' => $distance, ':hrs' => 0]);
        }
    }

    successResponse(['tracking_number' => $trackingId, 'duplicates' => $duplicates]);
}
if ($action === 'cancel') {
    if ($user['role'] !== 'regular') {
        errorResponse('Only regular users can cancel complaints.', 403);
    }

    $id     = trim((string)($data['id'] ?? ''));
    $userId = (int)($user['user_id'] ?? $user['id'] ?? 0);
    if ($id === '') {
        errorResponse('Complaint ID is required.');
    }

    $stmt = $db->prepare('SELECT complaint_id, status FROM Complaints WHERE tracking_id = :id AND user_id = :uid');
    $stmt->execute([':id' => $id, ':uid' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        errorResponse('Complaint not found.');
    }
    if ($row['status'] !== 'submitted') {
        errorResponse('Only complaints that are still submitted may be cancelled.');
    }

    $db->prepare("UPDATE Complaints SET status = 'cancelled' WHERE complaint_id = :cid")
       ->execute([':cid' => $row['complaint_id']]);

    $db->prepare('INSERT INTO Status_history (complaint_id, changed_by, status, notes) VALUES (:cid, :uid, :status, :notes)')
       ->execute([':cid' => $row['complaint_id'], ':uid' => $userId, ':status' => 'cancelled', ':notes' => 'User cancelled the complaint before verification.']);

    successResponse(['message' => 'Complaint cancelled successfully.']);
}

if ($action === 'rate') {
    if ($user['role'] !== 'regular') {
        errorResponse('Only regular users may rate completed cases.', 403);
    }

    $id      = trim((string)($data['id'] ?? ''));
    $rating  = intval($data['rating'] ?? 0);
    $comment = trim((string)($data['comment'] ?? ''));
    $userId  = (int)($user['user_id'] ?? $user['id'] ?? 0);

    if ($id === '' || $rating < 1 || $rating > 5) {
        errorResponse('A valid complaint ID and rating (1-5) are required.');
    }

    $stmt = $db->prepare('SELECT complaint_id, status FROM Complaints WHERE tracking_id = :id AND user_id = :uid');
    $stmt->execute([':id' => $id, ':uid' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        errorResponse('Complaint not found.');
    }
    if (!in_array($row['status'], ['closed', 'resolved'], true)) {
        errorResponse('Only closed or resolved cases may be rated.');
    }
    $complaintId = (int)$row['complaint_id'];

    $existStmt = $db->prepare('SELECT 1 FROM Ratings WHERE complaint_id = :cid AND user_id = :uid');
    $existStmt->execute([':cid' => $complaintId, ':uid' => $userId]);
    if ($existStmt->fetchColumn()) {
        errorResponse('You have already rated this complaint.');
    }

    $offStmt = $db->prepare('SELECT field_officer_id FROM Assignments WHERE complaint_id = :cid ORDER BY assigned_at DESC LIMIT 1');
    $offStmt->execute([':cid' => $complaintId]);
    $officerId = $offStmt->fetchColumn() ?: null;

    $db->prepare('INSERT INTO Ratings (complaint_id, user_id, field_officer_id, score, comments) VALUES (:cid, :uid, :oid, :score, :comments)')
       ->execute([':cid' => $complaintId, ':uid' => $userId, ':oid' => $officerId, ':score' => $rating, ':comments' => $comment]);

    if ($officerId) {
        $db->prepare(
            'UPDATE Field_officers SET average_user_rating = (SELECT AVG(score) FROM Ratings WHERE field_officer_id = :oid) WHERE officer_id = :oid'
        )->execute([':oid' => $officerId]);
    }

    successResponse(['message' => 'Thank you for your rating.']);
}

errorResponse('Unknown action.');
