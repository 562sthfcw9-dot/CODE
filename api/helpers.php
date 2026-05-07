<?php
require_once __DIR__ . '/init.php';

function buildTrackingNumber(PDO $db): string
{
    $prefix = 'TRAPICO-' . date('Y-m-');
    $stmt   = $db->prepare('SELECT tracking_id FROM Complaints WHERE tracking_id LIKE :prefix ORDER BY tracking_id DESC LIMIT 1');
    $stmt->execute([':prefix' => $prefix . '%']);
    $last = $stmt->fetchColumn();

    if (!$last) {
        return $prefix . '000001';
    }

    $parts = explode('-', $last);
    $seq   = intval(array_pop($parts));
    return $prefix . str_pad((string)($seq + 1), 6, '0', STR_PAD_LEFT);
}

function getDistanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $earthRadius = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) * sin($dLat / 2)
       + cos(deg2rad($lat1)) * cos(deg2rad($lat2))
       * sin($dLng / 2) * sin($dLng / 2);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $earthRadius * $c;
}
