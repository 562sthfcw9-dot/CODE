<?php
// Test file - check if submit is working
require_once __DIR__ . '/api/init.php';

$data = [
    'action' => 'submit',
    'category' => 'Test',
    'barangay' => 'Commonwealth',
    'date' => '2026-05-07',
    'time' => '10:30',
    'description' => 'This is a test complaint with enough characters to pass validation for the submission',
    'priority' => 'medium',
    'anonymous' => false,
    'lat' => 14.6760,
    'lng' => 121.0437
];

$_SESSION['trapico_user'] = [
    'id' => 16,
    'user_id' => 16,
    'role' => 'regular',
    'username' => 'jdoe',
    'name' => 'Juan Doe',
    'email' => 'jdoe@example.com',
    'home_barangay' => 'Commonwealth'
];

$db = getDb();
try {
    $userId = (int)($_SESSION['trapico_user']['user_id'] ?? 16);
    
    // Try a simple insert
    $stmt = $db->prepare(
        'INSERT INTO Complaints (user_id, tracking_id, category, asset_town, priority, status, description, is_anonymous, latitude, longitude, incident_datetime)
         VALUES (:uid, :tracking, :cat, :brgy, :priority, :status, :desc, :anon, :lat, :lng, :datetime)'
    );
    
    $trackingId = 'TEST-' . time();
    $dateField = date('Y-m-d H:i:s', strtotime('2026-05-07 10:30'));
    
    $result = $stmt->execute([
        ':uid' => $userId,
        ':tracking' => $trackingId,
        ':cat' => 'Test',
        ':brgy' => 'Commonwealth',
        ':priority' => 'medium',
        ':status' => 'submitted',
        ':desc' => 'This is a test complaint with enough characters to pass validation',
        ':anon' => 0,
        ':lat' => 14.6760,
        ':lng' => 121.0437,
        ':datetime' => $dateField
    ]);
    
    echo json_encode([
        'success' => true,
        'message' => 'Test insert successful',
        'result' => $result,
        'tracking_id' => $trackingId,
        'user_id' => $userId
    ]);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
}
?>
