<?php
require_once __DIR__ . '/config.php';
$user = require_login();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function cleanup(PDO $pdo, int $pid): void {
    $pdo->prepare("DELETE FROM video_presence WHERE project_id=? AND last_seen < NOW() - INTERVAL '25 seconds'")->execute([$pid]);
    $pdo->prepare("DELETE FROM video_signals WHERE project_id=? AND created_at < NOW() - INTERVAL '2 minutes'")->execute([$pid]);
}

if ($action === 'join' && $method === 'POST') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    require_project($pid, $user['id']);
    $pdo = db();
    $pdo->prepare("INSERT INTO video_presence (project_id,user_id,display_name,color,last_seen)
        VALUES (?,?,?,?,NOW())
        ON CONFLICT(project_id,user_id) DO UPDATE SET display_name=EXCLUDED.display_name,color=EXCLUDED.color,last_seen=NOW()")
        ->execute([$pid,$user['id'],$user['display_name'],$user['color']]);
    cleanup($pdo, $pid);
    respond(['ok'=>true]);
}

if ($action === 'leave' && $method === 'POST') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    require_project($pid, $user['id']);
    db()->prepare('DELETE FROM video_presence WHERE project_id=? AND user_id=?')->execute([$pid,$user['id']]);
    respond(['ok'=>true]);
}

if ($action === 'peers' && $method === 'GET') {
    $pid = (int)($_GET['project_id'] ?? 0);
    require_project($pid, $user['id']);
    $pdo = db();
    $pdo->prepare("UPDATE video_presence SET last_seen=NOW() WHERE project_id=? AND user_id=?")->execute([$pid,$user['id']]);
    cleanup($pdo, $pid);
    $stmt = $pdo->prepare("SELECT user_id as id, display_name, color FROM video_presence WHERE project_id=? AND last_seen >= NOW() - INTERVAL '25 seconds'");
    $stmt->execute([$pid]);
    respond(['ok'=>true,'peers'=>$stmt->fetchAll(),'me'=>$user['id']]);
}

if ($action === 'send' && $method === 'POST') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    require_project($pid, $user['id']);
    $to = isset($in['to_user_id']) && $in['to_user_id'] !== null ? (int)$in['to_user_id'] : null;
    $type = trim((string)($in['type'] ?? ''));
    $payload = $in['payload'] ?? null;
    if ($type === '' || $payload === null) fail('Signal invalide.');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    db()->prepare('INSERT INTO video_signals (project_id,from_user_id,to_user_id,type,payload) VALUES (?,?,?,?,?)')
        ->execute([$pid, $user['id'], $to, $type, $json]);
    respond(['ok'=>true]);
}

if ($action === 'poll' && $method === 'GET') {
    $pid = (int)($_GET['project_id'] ?? 0);
    $since = (int)($_GET['since'] ?? 0);
    require_project($pid, $user['id']);
    $pdo = db();
    $pdo->prepare("UPDATE video_presence SET last_seen=NOW() WHERE project_id=? AND user_id=?")->execute([$pid,$user['id']]);
    cleanup($pdo, $pid);
    $stmt = $pdo->prepare("SELECT id,from_user_id,to_user_id,type,payload FROM video_signals
        WHERE project_id=? AND id>? AND from_user_id <> ? AND (to_user_id IS NULL OR to_user_id = ?) ORDER BY id ASC LIMIT 100");
    $stmt->execute([$pid, $since, $user['id'], $user['id']]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['payload'] = json_decode($r['payload'], true); }
    respond(['ok'=>true,'signals'=>$rows]);
}

fail('Action inconnue.', 404);
