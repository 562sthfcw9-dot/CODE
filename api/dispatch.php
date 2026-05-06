<?php
require_once __DIR__ . '/helpers.php';

$data = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'dashboard'));
$user = requireRole('dispatch');
$db = getDb();

if ($action === 'dashboard') {
    $counts = [];
    $counts['pending'] = (int)$db->query("SELECT COUNT(*) FROM traffic_complaints_master WHERE current_progress_status = 'submitted'")->fetchColumn();
    $counts['dup_count'] = (int)$db->query("SELECT COUNT(DISTINCT primary_complaint_tracking_number) FROM duplicate_complaint_detection")->fetchColumn();
    $counts['active_cases'] = (int)$db->query("SELECT COUNT(*) FROM traffic_complaints_master WHERE current_progress_status IN ('assigned','in_progress')")->fetchColumn();
    successResponse(['counts' => $counts]);
}

if ($action === 'queue') {
    $stmt = $db->query("SELECT t.tracking_number AS id, t.incident_category AS cat, t.incident_barangay AS brgy, t.urgency_priority AS priority, t.current_progress_status AS status, t.submission_timestamp AS date, t.is_reported_anonymously AS anon, t.incident_description AS desc, t.map_latitude AS lat, t.map_longitude AS lng, IF(d.duplicate_complaint_tracking_number IS NULL, 0, 1) AS duplicate FROM traffic_complaints_master t LEFT JOIN duplicate_complaint_detection d ON d.primary_complaint_tracking_number = t.tracking_number WHERE t.current_progress_status IN ('submitted','verified') ORDER BY t.submission_timestamp DESC");
    $complaints = $stmt->fetchAll();
    successResponse(['complaints' => $complaints]);
}

if ($action === 'officers') {
    $stmt = $db->query("SELECT officer_id AS id, employee_id_number AS code, full_name AS name, assigned_barangay_jurisdiction AS brgy, current_duty_status AS status, gps_latitude AS lat, gps_longitude AS lng, gps_last_updated, total_cases_resolved AS cases_closed, average_rating_from_citizens AS rating FROM field_officer_accounts WHERE account_status = 'active' ORDER BY current_duty_status ASC, total_cases_resolved DESC");
    $officers = $stmt->fetchAll();
    successResponse(['officers' => $officers]);
}

if ($action === 'verifyAssign') {
    $id = trim((string)($data['id'] ?? ''));
    $officerId = intval($data['officer_id'] ?? 0);
    if ($id === '' || $officerId <= 0) {
        errorResponse('Complaint ID and assigned officer are required.');
    }

    $stmt = $db->prepare('SELECT current_progress_status FROM traffic_complaints_master WHERE tracking_number = :id');
    $stmt->execute([':id' => $id]);
    $status = $stmt->fetchColumn();
    if (!$status) {
        errorResponse('Complaint not found.');
    }
    if (!in_array($status, ['submitted', 'verified'], true)) {
        errorResponse('Only submitted or verified complaints may be assigned.');
    }

    $db->prepare('UPDATE traffic_complaints_master SET current_progress_status = :status, verifying_dispatch_id = :admin_id WHERE tracking_number = :id')->execute([':status' => 'assigned', ':admin_id' => $user['id'], ':id' => $id]);

    $deadline = date('Y-m-d H:i:s', strtotime('+30 minutes'));
    $insert = $db->prepare('INSERT INTO officer_job_assignments (tracking_number, assigned_officer_id, assignment_start_time, response_deadline_timestamp, assignment_status) VALUES (:tracking, :officer_id, NOW(), :deadline, :status)');
    $insert->execute([':tracking' => $id, ':officer_id' => $officerId, ':deadline' => $deadline, ':status' => 'pending']);

    $stmt = $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)');
    $stmt->execute([':tracking' => $id, ':status' => 'assigned', ':remarks' => 'Verified and assigned to officer ID ' . $officerId]);

    successResponse(['message' => 'Complaint verified and assigned successfully.']);
}

if ($action === 'reject') {
    $id = trim((string)($data['id'] ?? ''));
    $reason = trim((string)($data['reason'] ?? ''));

    if ($id === '' || $reason === '') {
        errorResponse('Complaint ID and rejection reason are required.');
    }

    $db->prepare('UPDATE traffic_complaints_master SET current_progress_status = :status, dispatch_rejection_note = :reason, verifying_dispatch_id = :admin_id WHERE tracking_number = :id')->execute([':status' => 'rejected', ':reason' => $reason, ':admin_id' => $user['id'], ':id' => $id]);
    $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)')->execute([':tracking' => $id, ':status' => 'rejected', ':remarks' => $reason]);

    successResponse(['message' => 'Complaint rejected with reason.']);
}

if ($action === 'reassign') {
    $id = trim((string)($data['id'] ?? ''));
    $newOfficerId = intval($data['officer_id'] ?? 0);
    if ($id === '' || $newOfficerId <= 0) {
        errorResponse('Complaint ID and reassigned officer are required.');
    }

    $stmt = $db->prepare('SELECT assignment_id, assigned_officer_id FROM officer_job_assignments WHERE tracking_number = :tracking AND assignment_status IN ("pending", "in_progress") ORDER BY assignment_start_time DESC LIMIT 1');
    $stmt->execute([':tracking' => $id]);
    $current = $stmt->fetch();
    if (!$current) {
        errorResponse('No active assignment found for this complaint.');
    }

    $db->prepare('UPDATE officer_job_assignments SET assignment_status = :status, reassigned_to_new_officer_id = :new_officer_id, reassignment_reason = :reason, reassignment_timestamp = NOW() WHERE assignment_id = :assignment_id')->execute([':status' => 'reassigned', ':new_officer_id' => $newOfficerId, ':reason' => 'Dispatch reassigned case', ':assignment_id' => $current['assignment_id']]);
    $deadline = date('Y-m-d H:i:s', strtotime('+30 minutes'));
    $db->prepare('INSERT INTO officer_job_assignments (tracking_number, assigned_officer_id, assignment_start_time, response_deadline_timestamp, assignment_status, reassignment_reason) VALUES (:tracking, :officer_id, NOW(), :deadline, :status, :reason)')->execute([':tracking' => $id, ':officer_id' => $newOfficerId, ':deadline' => $deadline, ':status' => 'pending', ':reason' => 'Reassigned after failure to arrive']);
    $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)')->execute([':tracking' => $id, ':status' => 'assigned', ':remarks' => 'Case reassigned to officer ID ' . $newOfficerId]);

    successResponse(['message' => 'Case reassigned successfully.']);
}

if ($action === 'activeCases') {
    $stmt = $db->query("SELECT t.tracking_number AS id, t.incident_category AS cat, t.incident_barangay AS brgy, t.urgency_priority AS priority, t.current_progress_status AS status, t.submission_timestamp AS date, t.incident_description AS desc, t.map_latitude AS lat, t.map_longitude AS lng FROM traffic_complaints_master t WHERE t.current_progress_status IN ('assigned','in_progress') ORDER BY t.submission_timestamp DESC");
    successResponse(['activeCases' => $stmt->fetchAll()]);
}

if ($action === 'closeCase') {
    $id = trim((string)($data['id'] ?? ''));
    $feedback = trim((string)($data['feedback'] ?? ''));
    if ($id === '') {
        errorResponse('Complaint ID is required.');
    }

    $stmt = $db->prepare('SELECT current_progress_status FROM traffic_complaints_master WHERE tracking_number = :id');
    $stmt->execute([':id' => $id]);
    $status = $stmt->fetchColumn();
    if (!$status) {
        errorResponse('Complaint not found.');
    }
    if ($status !== 'resolved') {
        errorResponse('Only resolved complaints can be closed.');
    }

    /* Approve the resolution report */
    $db->prepare('UPDATE resolution_reports SET dispatch_approval_status = :approval, dispatch_feedback = :feedback, dispatch_reviewed_by = :admin_id, dispatch_review_timestamp = NOW() WHERE tracking_number = :id')
        ->execute([':approval' => 'approved', ':feedback' => $feedback, ':admin_id' => $user['id'], ':id' => $id]);

    /* Advance complaint to closed and record verifying dispatch */
    $db->prepare('UPDATE traffic_complaints_master SET current_progress_status = :status, verifying_dispatch_id = :admin_id WHERE tracking_number = :id')
        ->execute([':status' => 'closed', ':admin_id' => $user['id'], ':id' => $id]);

    /* Update officer total_cases_resolved */
    $offStmt = $db->prepare('SELECT assigned_officer_id FROM officer_job_assignments WHERE tracking_number = :id AND assignment_status = :status ORDER BY assignment_start_time DESC LIMIT 1');
    $offStmt->execute([':id' => $id, ':status' => 'completed']);
    $officerId = $offStmt->fetchColumn();
    if ($officerId) {
        $db->prepare('UPDATE field_officer_accounts SET total_cases_resolved = total_cases_resolved + 1 WHERE officer_id = :id')
            ->execute([':id' => $officerId]);
    }

    $db->prepare('INSERT INTO complaint_lifecycle_timeline (tracking_number, status_reached, status_remarks) VALUES (:tracking, :status, :remarks)')
        ->execute([':tracking' => $id, ':status' => 'closed', ':remarks' => 'Dispatch officer validated and closed the case.']);

    successResponse(['message' => 'Case closed successfully.']);
}

errorResponse('Unknown action.');
