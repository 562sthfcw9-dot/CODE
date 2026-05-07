<?php
require_once __DIR__ . '/helpers.php';

$data       = getJsonPayload();
$action     = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'assigned'));
$user       = requireRole('field');
$db         = getDb();
$officerId  = (int)($user['id'] ?? 0);
$officerUid = (int)($user['user_id'] ?? $officerId);

if ($action === 'assigned') {
    $stmt = $db->prepare(
        'SELECT a.assignment_id, c.tracking_id AS id, a.response_deadline AS deadline,
                a.has_checked_in AS checked_in, a.assignment_status,
                c.category AS cat, c.asset_town AS brgy, c.priority, c.status,
                c.submitted_at AS date, c.description AS `desc`,
                c.latitude AS lat, c.longitude AS lng, c.is_anonymous AS anon
         FROM Assignments a
         JOIN Complaints c ON c.complaint_id = a.complaint_id
         WHERE a.field_officer_id = :oid AND a.assignment_status IN ("pending","in_progress")
         ORDER BY a.assigned_at DESC'
    );
    $stmt->execute([':oid' => $officerId]);
    successResponse(['assignments' => $stmt->fetchAll()]);
}

if ($action === 'checkin') {
    $assignmentId = intval($data['assignment_id'] ?? 0);
    $simulate     = isset($data['simulate']) && boolval($data['simulate']);
    if ($assignmentId <= 0) {
        errorResponse('Assignment ID is required.');
    }

    $stmt = $db->prepare(
        'SELECT a.complaint_id, c.tracking_id AS tracking_number,
                c.latitude AS lat, c.longitude AS lng
         FROM Assignments a
         JOIN Complaints c ON c.complaint_id = a.complaint_id
         WHERE a.assignment_id = :aid AND a.field_officer_id = :oid'
    );
    $stmt->execute([':aid' => $assignmentId, ':oid' => $officerId]);
    $row = $stmt->fetch();
    if (!$row) {
        errorResponse('Assignment not found.');
    }

    if (!$simulate) {
        if (!isset($data['lat']) || !isset($data['lng'])) {
            errorResponse('GPS coordinates are required for check-in.');
        }
        $distance = getDistanceMeters((float)$row['lat'], (float)$row['lng'], floatval($data['lat']), floatval($data['lng']));
        if ($distance > 150) {
            errorResponse('You are not within the 150m geofence. Move closer to the incident site and try again.');
        }
    }

    $chkLat = $simulate ? null : floatval($data['lat']);
    $chkLng = $simulate ? null : floatval($data['lng']);

    $db->prepare(
        'UPDATE Assignments SET has_checked_in = 1, arrived_at = NOW(), assignment_status = :status,
         checkin_latitude = :lat, checkin_longitude = :lng WHERE assignment_id = :aid'
    )->execute([':status' => 'in_progress', ':lat' => $chkLat, ':lng' => $chkLng, ':aid' => $assignmentId]);

    if (!$simulate && $chkLat !== null) {
        $db->prepare(
            "UPDATE Field_officers SET current_latitude = :lat, current_longitude = :lng,
             gps_last_updated = NOW(), is_available = 'busy' WHERE officer_id = :oid"
        )->execute([':lat' => $chkLat, ':lng' => $chkLng, ':oid' => $officerId]);
    }

    $db->prepare("UPDATE Complaints SET status = 'in_progress' WHERE complaint_id = :cid")
       ->execute([':cid' => $row['complaint_id']]);

    $db->prepare('INSERT INTO Status_history (complaint_id, changed_by, status, notes) VALUES (:cid, :uid, :status, :notes)')
       ->execute([':cid' => $row['complaint_id'], ':uid' => $officerUid, ':status' => 'in_progress', ':notes' => 'Field officer checked in within the geofence.']);

    successResponse(['message' => 'Check-in confirmed. Status updated to In Progress.']);
}

if ($action === 'submitResolution') {
    $assignmentId = intval($data['assignment_id'] ?? 0);
    $method       = trim((string)($data['method'] ?? ''));
    $desc         = trim((string)($data['description'] ?? ''));

    if ($assignmentId <= 0 || $method === '' || $desc === '') {
        errorResponse('Assignment ID, resolution method, and description are required.');
    }

    $stmt = $db->prepare(
        'SELECT a.complaint_id, c.tracking_id AS tracking_number
         FROM Assignments a
         JOIN Complaints c ON c.complaint_id = a.complaint_id
         WHERE a.assignment_id = :aid AND a.field_officer_id = :oid'
    );
    $stmt->execute([':aid' => $assignmentId, ':oid' => $officerId]);
    $row = $stmt->fetch();
    if (!$row) {
        errorResponse('Active assignment not found.');
    }
    $complaintId = (int)$row['complaint_id'];

    $db->prepare(
        'INSERT INTO resolution_reports (complaint_id, assignment_id, officer_id, resolution_description,
         before_photo_url, after_photo_url, submitted_at, dispatch_approval_status)
         VALUES (:cid, :aid, :oid, :desc, :before, :after, NOW(), :status)'
    )->execute([
        ':cid'    => $complaintId,
        ':aid'    => $assignmentId,
        ':oid'    => $officerId,
        ':desc'   => $desc,
        ':before' => '',
        ':after'  => '',
        ':status' => 'pending',
    ]);

    $db->prepare("UPDATE Complaints SET status = 'resolved' WHERE complaint_id = :cid")
       ->execute([':cid' => $complaintId]);

    $db->prepare("UPDATE Assignments SET assignment_status = 'completed' WHERE assignment_id = :aid")
       ->execute([':aid' => $assignmentId]);

    $db->prepare("UPDATE Field_officers SET is_available = 'available' WHERE officer_id = :oid")
       ->execute([':oid' => $officerId]);

    $db->prepare('INSERT INTO Status_history (complaint_id, changed_by, status, notes) VALUES (:cid, :uid, :status, :notes)')
       ->execute([':cid' => $complaintId, ':uid' => $officerUid, ':status' => 'resolved', ':notes' => 'Field officer submitted resolution report.']);

    successResponse(['message' => 'Resolution submitted successfully.']);
}

if ($action === 'updateGps') {
    $lat    = isset($data['lat']) ? floatval($data['lat']) : null;
    $lng    = isset($data['lng']) ? floatval($data['lng']) : null;
    $status = trim((string)($data['status'] ?? ''));

    if ($lat === null || $lng === null) {
        errorResponse('GPS coordinates (lat, lng) are required.');
    }

    $validStatuses = ['available', 'busy', 'offline'];
    $params = [':lat' => $lat, ':lng' => $lng, ':oid' => $officerId];

    if ($status !== '' && in_array($status, $validStatuses, true)) {
        $db->prepare(
            'UPDATE Field_officers SET current_latitude = :lat, current_longitude = :lng,
             gps_last_updated = NOW(), is_available = :status WHERE officer_id = :oid'
        )->execute(array_merge($params, [':status' => $status]));
    } else {
        $db->prepare(
            'UPDATE Field_officers SET current_latitude = :lat, current_longitude = :lng,
             gps_last_updated = NOW() WHERE officer_id = :oid'
        )->execute($params);
    }

    successResponse(['message' => 'GPS position updated.']);
}

if ($action === 'history') {
    $stmt = $db->prepare(
        'SELECT c.tracking_id AS id, c.category AS cat, c.asset_town AS brgy,
                c.priority, c.status, c.submitted_at AS date,
                r.score AS rating
         FROM Complaints c
         JOIN Assignments a ON a.complaint_id = c.complaint_id
         LEFT JOIN Ratings r ON r.complaint_id = c.complaint_id AND r.user_id = c.user_id
         WHERE a.field_officer_id = :oid AND c.status IN ("resolved","closed","cancelled")
         ORDER BY c.submitted_at DESC'
    );
    $stmt->execute([':oid' => $officerId]);
    successResponse(['history' => $stmt->fetchAll()]);
}

if ($action === 'performance') {
    $stmt = $db->prepare('SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND assignment_status = "completed"');
    $stmt->execute([':oid' => $officerId]);
    $resolved = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND assignment_status IN ("pending","in_progress")');
    $stmt->execute([':oid' => $officerId]);
    $active = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('SELECT avg_response_time, average_user_rating FROM Field_officers WHERE officer_id = :oid');
    $stmt->execute([':oid' => $officerId]);
    $metrics = $stmt->fetch();

    successResponse(['performance' => [
        'resolved'      => $resolved,
        'active'        => $active,
        'on_time_rate'  => $metrics['avg_response_time'] ?? 0,
        'satisfaction'  => $metrics['average_user_rating'] ?? 5,
    ]]);
}

errorResponse('Unknown action.');
