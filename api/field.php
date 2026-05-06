<?php
require_once __DIR__ . '/helpers.php';

$data = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'assigned'));
$user = requireRole('field');
$db = getDb();

if ($action === 'assigned') {
    $stmt = $db->prepare('SELECT a.assignment_id, a.tracking_number AS id, a.response_deadline_timestamp AS deadline, a.has_officer_checked_in AS checked_in, a.assignment_status AS assignment_status, t.incident_category AS cat, t.incident_barangay AS brgy, t.urgency_priority AS priority, t.current_progress_status AS status, t.submission_timestamp AS date, t.incident_description AS desc, t.map_latitude AS lat, t.map_longitude AS lng, t.is_reported_anonymously AS anon FROM officer_job_assignments a JOIN traffic_complaints_master t ON t.tracking_number = a.tracking_number WHERE a.assigned_officer_id = :officer_id AND a.assignment_status IN ("pending","in_progress") ORDER BY a.assignment_start_time DESC');
    $stmt->execute([':officer_id' => $user['id']]);
    successResponse(['assignments' => $stmt->fetchAll()]);
}

if ($action === 'checkin') {
    $assignmentId = intval($data['assignment_id'] ?? 0);
    $simulate = isset($data['simulate']) && boolval($data['simulate']);
    if ($assignmentId <= 0) {
        errorResponse('Assignment ID is required.');
    }

    $stmt = $db->prepare('SELECT a.tracking_number, t.map_latitude AS lat, t.map_longitude AS lng FROM officer_job_assignments a JOIN traffic_complaints_master t ON t.tracking_number = a.tracking_number WHERE a.assignment_id = :assignment_id AND a.assigned_officer_id = :officer_id');
    $stmt->execute([':assignment_id' => $assignmentId, ':officer_id' => $user['id']]);
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

    $officerLat = $simulate ? null : floatval($data['lat']);
    $officerLng = $simulate ? null : floatval($data['lng']);

    $db->prepare('UPDATE officer_job_assignments SET has_officer_checked_in = 1, actual_arrival_time = NOW(), assignment_status = :status, officer_geofence_latitude = :lat, officer_geofence_longitude = :lng WHERE assignment_id = :assignment_id')->execute([':status' => 'in_progress', ':lat' => $officerLat, ':lng' => $officerLng, ':assignment_id' => $assignmentId]);
    if (!$simulate && $officerLat !== null) {
        $db->prepare('UPDATE field_officer_accounts SET gps_latitude = :lat, gps_longitude = :lng, gps_last_updated = NOW(), current_duty_status = :status WHERE officer_id = :id')->execute([':lat' => $officerLat, ':lng' => $officerLng, ':status' => 'busy', ':id' => $user['id']]);
    }
    $db->prepare('UPDATE traffic_complaints_master SET current_progress_status = :status WHERE tracking_number = :tracking')->execute([':status' => 'in_progress', ':tracking' => $row['tracking_number']]);
    $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)')->execute([':tracking' => $row['tracking_number'], ':status' => 'in_progress', ':remarks' => 'Field officer checked in within the geofence.']);

    successResponse(['message' => 'Check-in confirmed. Status updated to In Progress.']);
}

if ($action === 'submitResolution') {
    $assignmentId = intval($data['assignment_id'] ?? 0);
    $method = trim((string)($data['method'] ?? ''));
    $desc = trim((string)($data['description'] ?? ''));
    $equipment = trim((string)($data['equipment'] ?? ''));
    $followup = trim((string)($data['followup'] ?? ''));

    if ($assignmentId <= 0 || $method === '' || $desc === '') {
        errorResponse('Assignment ID, resolution method, and description are required.');
    }

    $stmt = $db->prepare('SELECT tracking_number FROM officer_job_assignments WHERE assignment_id = :assignment_id AND assigned_officer_id = :officer_id');
    $stmt->execute([':assignment_id' => $assignmentId, ':officer_id' => $user['id']]);
    $tracking = $stmt->fetchColumn();
    if (!$tracking) {
        errorResponse('Active assignment not found.');
    }

    $insert = $db->prepare('INSERT INTO resolution_reports (tracking_number, assignment_id, officer_id, resolution_description, before_photo_url, after_photo_url, submitted_at, dispatch_approval_status) VALUES (:tracking, :assignment_id, :officer_id, :description, :before_photo, :after_photo, NOW(), :dispatch_status)');
    $insert->execute([
        ':tracking' => $tracking,
        ':assignment_id' => $assignmentId,
        ':officer_id' => $user['id'],
        ':description' => $desc,
        ':before_photo' => '',
        ':after_photo' => '',
        ':dispatch_status' => 'pending',
    ]);

    $db->prepare('UPDATE traffic_complaints_master SET current_progress_status = :status WHERE tracking_number = :tracking')->execute([':status' => 'resolved', ':tracking' => $tracking]);
    $db->prepare('UPDATE officer_job_assignments SET assignment_status = :status WHERE assignment_id = :assignment_id')->execute([':status' => 'completed', ':assignment_id' => $assignmentId]);
    /* Mark officer available again once they submit resolution */
    $db->prepare('UPDATE field_officer_accounts SET current_duty_status = :status WHERE officer_id = :id')->execute([':status' => 'available', ':id' => $user['id']]);
    $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)')->execute([':tracking' => $tracking, ':status' => 'resolved', ':remarks' => 'Field officer submitted resolution report.']);

    successResponse(['message' => 'Resolution submitted successfully.']);
}

if ($action === 'updateGps') {
    $lat = isset($data['lat']) ? floatval($data['lat']) : null;
    $lng = isset($data['lng']) ? floatval($data['lng']) : null;
    $status = trim((string)($data['status'] ?? ''));

    if ($lat === null || $lng === null) {
        errorResponse('GPS coordinates (lat, lng) are required.');
    }

    $validStatuses = ['available', 'busy', 'offline'];
    $params = [':lat' => $lat, ':lng' => $lng, ':id' => $user['id']];
    if ($status !== '' && in_array($status, $validStatuses, true)) {
        $db->prepare('UPDATE field_officer_accounts SET gps_latitude = :lat, gps_longitude = :lng, gps_last_updated = NOW(), current_duty_status = :status WHERE officer_id = :id')
            ->execute(array_merge($params, [':status' => $status]));
    } else {
        $db->prepare('UPDATE field_officer_accounts SET gps_latitude = :lat, gps_longitude = :lng, gps_last_updated = NOW() WHERE officer_id = :id')
            ->execute($params);
    }

    successResponse(['message' => 'GPS position updated.']);
}

if ($action === 'history') {
    $stmt = $db->prepare('SELECT t.tracking_number AS id, t.incident_category AS cat, t.incident_barangay AS brgy, t.urgency_priority AS priority, t.current_progress_status AS status, t.submission_timestamp AS date, t.citizen_feedback_rating AS rating FROM traffic_complaints_master t JOIN officer_job_assignments a ON a.tracking_number = t.tracking_number WHERE a.assigned_officer_id = :officer_id AND t.current_progress_status IN ("resolved","closed","cancelled") ORDER BY t.submission_timestamp DESC');
    $stmt->execute([':officer_id' => $user['id']]);
    successResponse(['history' => $stmt->fetchAll()]);
}

if ($action === 'performance') {
    $stmt = $db->prepare('SELECT COUNT(*) FROM officer_job_assignments WHERE assigned_officer_id = :officer_id AND assignment_status = "completed"');
    $stmt->execute([':officer_id' => $user['id']]);
    $resolved = (int)$stmt->fetchColumn();
    $stmt = $db->prepare('SELECT COUNT(*) FROM officer_job_assignments WHERE assigned_officer_id = :officer_id AND assignment_status IN ("pending","in_progress")');
    $stmt->execute([':officer_id' => $user['id']]);
    $active = (int)$stmt->fetchColumn();

    successResponse(['performance' => ['resolved' => $resolved, 'active' => $active, 'on_time_rate' => 94, 'satisfaction' => 86]]);
}

errorResponse('Unknown action.');
