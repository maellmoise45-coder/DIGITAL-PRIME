<?php
require_once __DIR__ . '/config.php';
$user = require_login();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

$STATUSES = ['available', 'focus', 'meeting', 'away'];

if ($action === 'heartbeat' && $method === 'POST') {
    $in = json_input();
    $status = (string)($in['status'] ?? 'available');
    if (!in_array($status, $STATUSES, true)) $status = 'available';
    $minutes = max(5, min(180, (int)($in['minutes'] ?? 25)));
    $focus = $status === 'focus' ? date('Y-m-d H:i:s', time() + $minutes * 60) : null;
    db()->prepare("INSERT INTO user_presence (user_id,status,focus_until,last_seen) VALUES (?,?,?,NOW())
        ON CONFLICT(user_id) DO UPDATE SET
            status=EXCLUDED.status,
            focus_until=CASE WHEN EXCLUDED.status='focus'
                THEN CASE WHEN user_presence.focus_until > NOW() THEN user_presence.focus_until ELSE EXCLUDED.focus_until END
                ELSE NULL END,
            last_seen=NOW()")
        ->execute([$user['id'], $status, $focus]);
    respond(['ok' => true, 'status' => $status]);
}

if ($action === 'me' && $method === 'GET') {
    $stmt = db()->prepare('SELECT status, focus_until FROM user_presence WHERE user_id=?');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch() ?: ['status' => 'available', 'focus_until' => null];
    respond(['ok' => true, 'status' => $row['status'], 'focus_until' => $row['focus_until']]);
}

if ($action === 'team' && $method === 'GET') {
    $pid = (int)($_GET['project_id'] ?? 0);
    require_project($pid, $user['id']);
    $stmt = db()->prepare("SELECT u.id, u.username, u.display_name, u.color,
        COALESCE(p.status,'available') AS status,
        CASE WHEN p.focus_until IS NOT NULL AND p.focus_until > NOW()
            THEN EXTRACT(EPOCH FROM (p.focus_until - NOW()))::int ELSE 0 END AS focus_left,
        CASE WHEN p.last_seen >= NOW() - INTERVAL '45 seconds' THEN true ELSE false END AS online
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        LEFT JOIN user_presence p ON p.user_id = u.id
        WHERE pm.project_id = ?
        ORDER BY (p.last_seen >= NOW() - INTERVAL '45 seconds') DESC, u.display_name ASC");
    $stmt->execute([$pid]);
    respond(['ok' => true, 'members' => $stmt->fetchAll()]);
}

fail('Action inconnue.', 404);
