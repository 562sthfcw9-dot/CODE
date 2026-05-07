<?php
require_once __DIR__ . '/helpers.php';

$data   = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'dashboard'));
$user   = requireRole('dispatch');
$db     = getDb();
$dispatchId = (int)($user['id'] ?? 0);
$dispatchUid = (int)($user['user_id'] ?? $dispatchId);

if ($action === 'dashboard') {
    $counts = [];
    $counts['pending']      = (int)$db->query("SELECT COUNT(*) FROM Complaints WHERE status = 'submitted'")->fetchColumn();
    $counts['dup_count']    = (int)$db->query("SELECT COUNT(DISTINCT primary_complaint_id) FROM duplicate_complaint_detection")->fetchColumn();
    $counts['active_cases'] = (int)$db->query("SELECT COUNT(*) FROM Complaints WHERE status IN ('assigned','in_progress')")->fetchColumn();
    successResponse(['counts' => $counts]);
}

if ($action === 'queue') {
    $stmt = $db->query(
        "SELECT c.tracking_id AS id, c.category AS cat, c.asset_town AS brgy,
                c.priority, c.status, c.submitted_at AS date,
                c.is_anonymous AS anon, c.description,
                c.latitude AS lat, c.longitude AS lng,
                IF(d.duplicate_complaint_id IS NULL, 0, 1) AS duplicate
         FROM Complaints c
         LEFT JOIN duplicate_complaint_detection d ON d.primary_complaint_id = c.complaint_id
         WHERE c.status IN ('submitted','verified')
         ORDER BY c.submitted_at DESC"
    );
    successResponse(['complaints' => $stmt->fetchAll()]);
}

if ($action === 'officers') {
    $stmt = $db->query(
        "SELECT f.officer_id AS id, f.badge_number AS code, u.full_name AS name,
                f.assigned_barangay AS brgy, f.is_available AS status,
                f.current_latitude AS lat, f.current_longitude AS lng,
                f.gps_last_updated, f.total_resolved AS cases_closed,
                f.average_user_rating AS rating
         FROM Field_officers f
         JOIN Users u ON u.user_id = f.user_id
         WHERE u.is_active = 1
         ORDER BY f.is_available ASC, f.total_resolved DESC"
    );
    successResponse(['officers' => $stmt->fetchAll()]);
}

if ($action === 'verifyAssign') {
    $trackingId = trim((string)($data['id'] ?? ''));
    $officerId  = intval($data['officer_id'] ?? 0);
    if ($trackingId === '' || $officerId <= 0) {
        errorResponse('Complaint ID and assigned officer are required.');
    }

    $cStmt = $db->prepare('SELECT complaint_id, status FROM Complaints WHERE tracking_id = :id');
    $cStmt->execute([':id' => $trackingId]);
    $complaint = $cStmt->fetch();
    if (!$complaint) {
        errorResponse('Complaint not found.');
    }
    if (!in_array($complaint['status'], ['submitted', 'verified'], true)) {
        errorResponse('Only submitted or verified complaints may be assigned.');
    }
    $complaintId = (int)$complaint['complaint_id'];

    $db->prepare('UPDATE Complaints SET status = :status, dispatch_id = :did WHERE complaint_id = :cid')
       ->execute([':status' => 'assigned', ':did' => $dispatchId, ':cid' => $complaintId]);

    $deadline = date('Y-m-d H:i:s', strtotime('+30 minutes'));
    $db->prepare(
        'INSERT INTO Assignments (complaint_id, field_officer_id, dispatch_id, assigned_at, response_deadline, assignment_status)
         VALUES (:cid, :officer_id, :did, NOW(), :deadline, :status)'
    )->execute([':cid' => $complaintId, ':officer_id' => $officerId, ':did' => $dispatchId, ':deadline' => $deadline, ':status' => 'pending']);

    $db->prepare(
        'INSERT INTO Status_history (complaint_id, changed_by, status, notes)
         VALUES (:cid, :uid, :status, :notes)'
    )->execute([':cid' => $complaintId, ':uid' => $dispatchUid, ':status' => 'assigned', ':notes' => 'Verified and assigned to officer ID ' . $officerId]);

    successResponse(['message' => 'Complaint verified and assigned successfully.']);
}

if ($action === 'reject') {
    $trackingId = trim((string)($data['id'] ?? ''));
    $reason     = trim((string)($data['reason'] ?? ''));
    if ($trackingId === '' || $reason === '') {
        errorResponse('Complaint ID and rejection reason are required.');
    }

    $cStmt = $db->prepare('SELECT complaint_id FROM Complaints WHERE tracking_id = :id');
    $cStmt->execute([':id' => $trackingId]);
    $complaintId = (int)$cStmt->fetchColumn();
    if (!$complaintId) {
        errorResponse('Complaint not found.');
    }

    $db->prepare('UPDATE Complaints SET status = :status, rejection_reason = :reason, rejected_by = :did, dispatch_id = :did WHERE complaint_id = :cid')
       ->execute([':status' => 'rejected', ':reason' => $reason, ':did' => $dispatchId, ':cid' => $complaintId]);

    $db->prepare('INSERT INTO Status_history (complaint_id, changed_by, status, notes) VALUES (:cid, :uid, :status, :notes)')
       ->execute([':cid' => $complaintId, ':uid' => $dispatchUid, ':status' => 'rejected', ':notes' => $reason]);

    successResponse(['message' => 'Complaint rejected with reason.']);
}

if ($action === 'reassign') {
    $trackingId  = trim((string)($data['id'] ?? ''));
    $newOfficerId = intval($data['officer_id'] ?? 0);
    if ($trackingId === '' || $newOfficerId <= 0) {
        errorResponse('Complaint ID and reassigned officer are required.');
    }

    $cStmt = $db->prepare('SELECT complaint_id FROM Complaints WHERE tracking_id = :id');
    $cStmt->execute([':id' => $trackingId]);
    $complaintId = (int)$cStmt->fetchColumn();
    if (!$complaintId) {
        errorResponse('Complaint not found.');
    }

    $stmt = $db->prepare(
        'SELECT assignment_id, field_officer_id FROM Assignments
         WHERE complaint_id = :cid AND assignment_status IN ("pending","in_progress")
         ORDER BY assigned_at DESC LIMIT 1'
    );
    $stmt->execute([':cid' => $complaintId]);
    $current = $stmt->fetch();
    if (!$current) {
        errorResponse('No active assignment found for this complaint.');
    }

    $db->prepare(
        'UPDATE Assignments SET assignment_status = :status, reassigned_to = :new_oid,
         reassignment_reason = :reason, reassignment_at = NOW()
         WHERE assignment_id = :aid'
    )->execute([':status' => 'reassigned', ':new_oid' => $newOfficerId, ':reason' => 'Dispatch reassigned case', ':aid' => $current['assignment_id']]);

    $deadline = date('Y-m-d H:i:s', strtotime('+30 minutes'));
    $db->prepare(
        'INSERT INTO Assignments (complaint_id, field_officer_id, dispatch_id, assigned_at, response_deadline, assignment_status, reassignment_reason)
         VALUES (:cid, :officer_id, :did, NOW(), :deadline, :status, :reason)'
    )->execute([':cid' => $complaintId, ':officer_id' => $newOfficerId, ':did' => $dispatchId, ':deadline' => $deadline, ':status' => 'pending', ':reason' => 'Reassigned after failure to arrive']);

    $db->prepare('INSERT INTO Status_history (complaint_id, changed_by, status, notes) VALUES (:cid, :uid, :status, :notes)')
       ->execute([':cid' => $complaintId, ':uid' => $dispatchUid, ':status' => 'assigned', ':notes' => 'Case reassigned to officer ID ' . $newOfficerId]);

    successResponse(['message' => 'Case reassigned successfully.']);
}

if ($action === 'activeCases') {
    $stmt = $db->query(
        "SELECT c.tracking_id AS id, c.category AS cat, c.asset_town AS brgy,
                c.priority, c.status, c.submitted_at AS date,
                c.description, c.latitude AS lat, c.longitude AS lng
         FROM Complaints c
         WHERE c.status IN ('assigned','in_progress')
         ORDER BY c.submitted_at DESC"
    );
    successResponse(['activeCases' => $stmt->fetchAll()]);
}

if ($action === 'closeCase') {
    $trackingId = trim((string)($data['id'] ?? ''));
    $feedback   = trim((string)($data['feedback'] ?? ''));
    if ($trackingId === '') {
        errorResponse('Complaint ID is required.');
    }

    $cStmt = $db->prepare('SELECT complaint_id, status FROM Complaints WHERE tracking_id = :id');
    $cStmt->execute([':id' => $trackingId]);
    $complaint = $cStmt->fetch();
    if (!$complaint) {
        errorResponse('Complaint not found.');
    }
    if ($complaint['status'] !== 'resolved') {
        errorResponse('Only resolved complaints can be closed.');
    }
    $complaintId = (int)$complaint['complaint_id'];

    $db->prepare(
        'UPDATE resolution_reports SET dispatch_approval_status = :approval, dispatch_feedback = :feedback,
         dispatch_reviewed_by = :did, dispatch_review_timestamp = NOW()
         WHERE complaint_id = :cid'
    )->execute([':approval' => 'approved', ':feedback' => $feedback, ':did' => $dispatchId, ':cid' => $complaintId]);

    $db->prepare('UPDATE Complaints SET status = :status, dispatch_id = :did WHERE complaint_id = :cid')
       ->execute([':status' => 'closed', ':did' => $dispatchId, ':cid' => $complaintId]);

    $offStmt = $db->prepare(
        'SELECT field_officer_id FROM Assignments
         WHERE complaint_id = :cid AND assignment_status = "completed"
         ORDER BY assigned_at DESC LIMIT 1'
    );
    $offStmt->execute([':cid' => $complaintId]);
    $officerId = $offStmt->fetchColumn();
    if ($officerId) {
        $db->prepare('UPDATE Field_officers SET total_resolved = total_resolved + 1 WHERE officer_id = :id')
           ->execute([':id' => $officerId]);
    }

    $db->prepare('INSERT INTO Status_history (complaint_id, changed_by, status, notes) VALUES (:cid, :uid, :status, :notes)')
       ->execute([':cid' => $complaintId, ':uid' => $dispatchUid, ':status' => 'closed', ':notes' => 'Dispatch officer validated and closed the case.']);

    successResponse(['message' => 'Case closed successfully.']);
}

errorResponse('Unknown action.');
