<?php
require_once __DIR__ . '/helpers.php';

$data   = getJsonPayload();
$action = trim((string)($_REQUEST['action'] ?? $data['action'] ?? 'dashboard'));
$user   = requireRole('dispatch');
$db     = getDb();
$dispatchId = (int)($user['id'] ?? 0);
$dispatchUid = (int)($user['user_id'] ?? $dispatchId);

/* ── Auto-release: assignments older than 3 hours become 'failed', officer freed ── */
try {
    $db->exec(
        "UPDATE Assignments SET assignment_status = 'failed'
         WHERE assignment_status IN ('pending','in_progress')
           AND assigned_at < NOW() - INTERVAL 3 HOUR"
    );
    $db->exec(
        "UPDATE Field_officers SET is_available = 'available'
         WHERE is_available = 'busy'
           AND officer_id NOT IN (
               SELECT DISTINCT field_officer_id FROM Assignments
               WHERE assignment_status IN ('pending','in_progress')
           )"
    );
} catch (PDOException $e) { /* non-fatal */ }

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
                CASE WHEN EXISTS (
                    SELECT 1 FROM duplicate_complaint_detection d
                    WHERE d.primary_complaint_id = c.complaint_id
                       OR d.duplicate_complaint_id = c.complaint_id
                ) THEN 1 ELSE 0 END AS duplicate
         FROM Complaints c
         WHERE c.status IN ('submitted','verified')
         ORDER BY c.submitted_at DESC"
    );
    successResponse(['complaints' => $stmt->fetchAll()]);
}

if ($action === 'updatePriority') {
    $trackingId = trim((string)($data['id'] ?? ''));
    $priority   = strtolower(trim((string)($data['priority'] ?? '')));
    $allowed    = ['low', 'medium', 'high', 'urgent'];

    if ($trackingId === '' || $priority === '') {
        errorResponse('Complaint ID and priority are required.');
    }
    if (!in_array($priority, $allowed, true)) {
        errorResponse('Invalid priority level. Allowed: low, medium, high, urgent.');
    }

    $cStmt = $db->prepare('SELECT complaint_id, status FROM Complaints WHERE tracking_id = :id LIMIT 1');
    $cStmt->execute([':id' => $trackingId]);
    $complaint = $cStmt->fetch();
    if (!$complaint) {
        errorResponse('Complaint not found.');
    }

    $complaintId = (int)$complaint['complaint_id'];
    $statusValue = (string)$complaint['status'];

    $db->prepare('UPDATE Complaints SET priority = :priority, dispatch_id = :did WHERE complaint_id = :cid')
       ->execute([':priority' => $priority, ':did' => $dispatchId, ':cid' => $complaintId]);

    $db->prepare(
        'INSERT INTO Status_history (complaint_id, changed_by, status, notes)
         VALUES (:cid, :uid, :status, :notes)'
    )->execute([
        ':cid' => $complaintId,
        ':uid' => $dispatchUid,
        ':status' => $statusValue,
        ':notes' => 'Priority level updated to ' . strtoupper($priority) . ' by dispatch.',
    ]);

    successResponse([
        'message' => 'Priority updated successfully.',
        'id' => $trackingId,
        'priority' => $priority,
    ]);
}

if ($action === 'officers') {
    $fieldStmt = $db->query(
        "SELECT f.officer_id AS id, f.badge_number AS code, u.full_name AS name,
                f.assigned_barangay AS brgy, f.is_available AS status,
                f.current_latitude AS lat, f.current_longitude AS lng,
                f.gps_last_updated, f.total_resolved AS cases_closed,
                f.average_user_rating AS rating,
                'field_officer' AS officer_role,
                CASE WHEN EXISTS (
                    SELECT 1 FROM Assignments a
                    WHERE a.field_officer_id = f.officer_id
                      AND a.assignment_status IN ('pending','in_progress')
                ) THEN 1 ELSE 0 END AS is_assigned
         FROM Field_officers f
         JOIN Users u ON u.user_id = f.user_id
         WHERE u.is_active = 1
         ORDER BY f.is_available ASC, f.total_resolved DESC"
    );

    $dispatchStmt = $db->query(
        "SELECT d.dispatch_id AS id, d.badge_number AS code, u.full_name AS name,
                d.assigned_barangay AS brgy,
                CASE WHEN d.is_on_duty = 1 THEN 'on_duty' ELSE 'off_duty' END AS status,
                NULL AS lat, NULL AS lng,
                NULL AS gps_last_updated,
                d.total_complaints_handled AS cases_closed,
                d.total_validated AS rating,
                'dispatch_officer' AS officer_role,
                0 AS is_assigned
         FROM Dispatch_officers d
         JOIN Users u ON u.user_id = d.user_id
         WHERE u.is_active = 1
         ORDER BY d.is_on_duty DESC, d.total_complaints_handled DESC"
    );

    $fieldOfficers = $fieldStmt->fetchAll();
    $dispatchOfficers = $dispatchStmt->fetchAll();
    $allOfficers = array_merge($fieldOfficers, $dispatchOfficers);

    successResponse([
        'officers' => $fieldOfficers,
        'field_officers' => $fieldOfficers,
        'dispatch_officers' => $dispatchOfficers,
        'all_officers' => $allOfficers,
    ]);
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

     // Block if officer already has an active assignment
     $activeCheck = $db->prepare(
          'SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND assignment_status IN ("pending","in_progress")'
     );
     $activeCheck->execute([':oid' => $officerId]);
     if ((int)$activeCheck->fetchColumn() > 0) {
          errorResponse('This officer is currently assigned to another complaint. Please select a different officer.');
     }

     $db->prepare('UPDATE Complaints SET status = :status, dispatch_id = :did WHERE complaint_id = :cid')
         ->execute([':status' => 'assigned', ':did' => $dispatchId, ':cid' => $complaintId]);

     // Mark officer as busy
     $db->prepare('UPDATE Field_officers SET is_available = "busy" WHERE officer_id = :oid')
         ->execute([':oid' => $officerId]);

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

    try {
        $db->prepare('UPDATE Complaints SET status = :status, rejection_reason = :reason, rejected_by = :did, dispatch_id = :did WHERE complaint_id = :cid')
           ->execute([':status' => 'rejected', ':reason' => $reason, ':did' => $dispatchId, ':cid' => $complaintId]);
    } catch (PDOException $e) {
        // Fallback for older schemas that do not yet include rejection metadata columns.
        $db->prepare('UPDATE Complaints SET status = :status, dispatch_id = :did WHERE complaint_id = :cid')
           ->execute([':status' => 'rejected', ':did' => $dispatchId, ':cid' => $complaintId]);
    }

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

    // Check if new officer is already assigned
    $newCheck = $db->prepare(
        'SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND assignment_status IN ("pending","in_progress")'
    );
    $newCheck->execute([':oid' => $newOfficerId]);
    if ((int)$newCheck->fetchColumn() > 0) {
        errorResponse('The selected officer is currently assigned to another complaint.');
    }

    $deadline = date('Y-m-d H:i:s', strtotime('+30 minutes'));
    $db->prepare(
        'INSERT INTO Assignments (complaint_id, field_officer_id, dispatch_id, assigned_at, response_deadline, assignment_status, reassignment_reason)
         VALUES (:cid, :officer_id, :did, NOW(), :deadline, :status, :reason)'
    )->execute([':cid' => $complaintId, ':officer_id' => $newOfficerId, ':did' => $dispatchId, ':deadline' => $deadline, ':status' => 'pending', ':reason' => 'Reassigned after failure to arrive']);

    // Free old officer if they have no remaining active assignments
    $oldOfficerId = (int)$current['field_officer_id'];
    $remainCheck = $db->prepare(
        'SELECT COUNT(*) FROM Assignments WHERE field_officer_id = :oid AND assignment_status IN ("pending","in_progress")'
    );
    $remainCheck->execute([':oid' => $oldOfficerId]);
    if ((int)$remainCheck->fetchColumn() === 0) {
        $db->prepare('UPDATE Field_officers SET is_available = "available" WHERE officer_id = :oid')
           ->execute([':oid' => $oldOfficerId]);
    }
    // Mark new officer as busy
    $db->prepare('UPDATE Field_officers SET is_available = "busy" WHERE officer_id = :oid')
       ->execute([':oid' => $newOfficerId]);

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

if ($action === 'caseTimeline') {
    $trackingId = trim((string)($data['id'] ?? ''));
    if ($trackingId === '') {
        errorResponse('Complaint ID is required.');
    }

    $cStmt = $db->prepare('SELECT complaint_id, submitted_at, status FROM Complaints WHERE tracking_id = :id');
    $cStmt->execute([':id' => $trackingId]);
    $complaint = $cStmt->fetch();
    if (!$complaint) {
        errorResponse('Complaint not found.');
    }

    $hStmt = $db->prepare(
        'SELECT status, notes, changed_at
         FROM Status_history
         WHERE complaint_id = :cid
         ORDER BY changed_at ASC, status_history_id ASC'
    );
    $hStmt->execute([':cid' => (int)$complaint['complaint_id']]);
    $timeline = $hStmt->fetchAll();

    successResponse([
        'timeline' => $timeline,
        'current_status' => $complaint['status'],
        'submitted_at' => $complaint['submitted_at'],
    ]);
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
