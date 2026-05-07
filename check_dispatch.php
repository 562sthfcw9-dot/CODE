<?php
require_once 'api/db.php';
$pdo = getDB();
$stmt = $pdo->query("SELECT u.user_id, u.username, u.email, d.badge_number FROM Users u JOIN Dispatch_officers d ON d.user_id = u.user_id WHERE u.role = 'dispatch_officer'");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
header('Content-Type: application/json');
echo json_encode($rows);
