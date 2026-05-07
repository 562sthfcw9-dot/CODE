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
                c.dispatch_id AS dispatch_id,
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
    $equipment    = trim((string)($data['equipment'] ?? ''));
    $followup     = trim((string)($data['followup'] ?? ''));
    $beforePhoto  = trim((string)($data['before_photo_url'] ?? ''));
    $afterPhoto   = trim((string)($data['after_photo_url'] ?? ''));

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

    $resolutionBody = "Method: {$method}\n\nDescription: {$desc}";
    if ($equipment !== '') {
        $resolutionBody .= "\n\nEquipment Used: {$equipment}";
    }
    if ($followup !== '') {
        $resolutionBody .= "\n\nFollow-Up Recommendations: {$followup}";
    }

    $db->prepare(
        'INSERT INTO resolution_reports (complaint_id, assignment_id, officer_id, resolution_description,
         before_photo_url, after_photo_url, submitted_at, dispatch_approval_status)
         VALUES (:cid, :aid, :oid, :desc, :before, :after, NOW(), :status)'
    )->execute([
        ':cid'    => $complaintId,
        ':aid'    => $assignmentId,
        ':oid'    => $officerId,
        ':desc'   => $resolutionBody,
        ':before' => $beforePhoto,
        ':after'  => $afterPhoto,
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
    $stmt = $db->prepare('SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid');
    $stmt->execute([':oid' => $officerId]);
    $totalAssignments = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND assignment_status = "completed"');
    $stmt->execute([':oid' => $officerId]);
    $resolved = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND assignment_status IN ("pending","in_progress")');
    $stmt->execute([':oid' => $officerId]);
    $active = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND arrived_at IS NOT NULL');
    $stmt->execute([':oid' => $officerId]);
    $arrivedCount = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND arrived_at IS NOT NULL AND arrived_at <= response_deadline');
    $stmt->execute([':oid' => $officerId]);
    $onTimeArrivals = (int)$stmt->fetchColumn();

    $stmt = $db->prepare(
        'SELECT AVG(TIMESTAMPDIFF(MINUTE, assigned_at, arrived_at)) AS avg_minutes,
                MIN(TIMESTAMPDIFF(MINUTE, assigned_at, arrived_at)) AS fastest_minutes,
                MAX(TIMESTAMPDIFF(MINUTE, assigned_at, arrived_at)) AS slowest_minutes
         FROM Assignments
         WHERE field_officer_id = :oid AND arrived_at IS NOT NULL'
    );
    $stmt->execute([':oid' => $officerId]);
    $arrivalMetrics = $stmt->fetch() ?: [];

    $stmt = $db->prepare('SELECT AVG(score) FROM Ratings WHERE field_officer_id = :oid');
    $stmt->execute([':oid' => $officerId]);
    $avgRating = $stmt->fetchColumn();

    $stmt = $db->prepare(
        'SELECT COUNT(*)
         FROM Assignments
         WHERE field_officer_id = :oid
           AND assignment_status = "completed"
           AND completed_at >= DATE_FORMAT(NOW(), "%Y-%m-01")'
    );
    $stmt->execute([':oid' => $officerId]);
    $resolvedThisMonth = (int)$stmt->fetchColumn();

    $stmt = $db->prepare(
        'SELECT c.tracking_id AS id, c.category AS cat, r.score AS score,
                COALESCE(r.comments, "") AS comments, r.submitted_at AS submitted_at
         FROM Ratings r
         JOIN Complaints c ON c.complaint_id = r.complaint_id
         WHERE r.field_officer_id = :oid
         ORDER BY r.submitted_at DESC
         LIMIT 8'
    );
    $stmt->execute([':oid' => $officerId]);
    $recentRatings = $stmt->fetchAll();

    $stmt = $db->prepare('SELECT avg_response_time, average_user_rating FROM Field_officers WHERE officer_id = :oid');
    $stmt->execute([':oid' => $officerId]);
    $metrics = $stmt->fetch();

    $onTimeRate = $arrivedCount > 0 ? round(($onTimeArrivals / $arrivedCount) * 100, 2) : 0;
    $closureRate = $totalAssignments > 0 ? round(($resolved / $totalAssignments) * 100, 2) : 0;
    $avgResponseMins = isset($arrivalMetrics['avg_minutes']) && $arrivalMetrics['avg_minutes'] !== null
        ? round((float)$arrivalMetrics['avg_minutes'], 2)
        : 0;
    $fastestMins = isset($arrivalMetrics['fastest_minutes']) && $arrivalMetrics['fastest_minutes'] !== null
        ? (int)$arrivalMetrics['fastest_minutes']
        : 0;
    $slowestMins = isset($arrivalMetrics['slowest_minutes']) && $arrivalMetrics['slowest_minutes'] !== null
        ? (int)$arrivalMetrics['slowest_minutes']
        : 0;
    $satisfaction = $avgRating !== null ? round((float)$avgRating, 2) : (float)($metrics['average_user_rating'] ?? 0);

    successResponse(['performance' => [
        'total_assignments' => $totalAssignments,
        'resolved'      => $resolved,
        'resolved_this_month' => $resolvedThisMonth,
        'active'        => $active,
        'on_time_rate'  => $onTimeRate,
        'closure_rate'  => $closureRate,
        'avg_response_mins' => $avgResponseMins,
        'fastest_mins'  => $fastestMins,
        'slowest_mins'  => $slowestMins,
        'satisfaction'  => $satisfaction,
        'recent_ratings' => $recentRatings,
    ]]);
}

errorResponse('Unknown action.');
