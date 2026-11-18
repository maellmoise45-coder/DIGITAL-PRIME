<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/webpush.php';
$user = require_login();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function cleanup(PDO $pdo, int $pid): void {
    $pdo->prepare("DELETE FROM video_presence WHERE project_id=? AND last_seen < NOW() - INTERVAL '25 seconds'")->execute([$pid]);
    $pdo->prepare("DELETE FROM video_signals WHERE project_id=? AND created_at < NOW() - INTERVAL '2 minutes'")->execute([$pid]);
}

function call_exists(PDO $pdo, int $pid, int $a, int $b, string $callId): bool {
    if ($callId === '') return false;
    // Les réponses partent du destinataire, les annulations de l'appelant : on accepte les deux sens.
    $stmt = $pdo->prepare("SELECT 1 FROM video_signals
        WHERE project_id=? AND type='call'
        AND ((from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?))
        AND payload::json->>'call_id' = ? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$pid, $a, $b, $b, $a, $callId]);
    return (bool)$stmt->fetchColumn();
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
    if (!in_array($type, ['offer','answer','ice'], true) || $payload === null) fail('Signal invalide.');
    if ($to !== null) {
        if ($to <= 0 || $to === (int)$user['id']) fail('Destinataire invalide.');
        $chk = db()->prepare('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?');
        $chk->execute([$pid, $to]);
        if (!$chk->fetchColumn()) fail('Destinataire invalide.');
    }
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

if ($action === 'call' && $method === 'POST') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    $to = (int)($in['to_user_id'] ?? 0);
    $mode = (($in['mode'] ?? 'video') === 'audio') ? 'audio' : 'video';
    $callId = trim((string)($in['call_id'] ?? ''));
    require_project($pid, $user['id']);
    if ($to <= 0 || $to === (int)$user['id']) fail('Destinataire invalide.');
    $chk = db()->prepare('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?');
    $chk->execute([$pid, $to]);
    if (!$chk->fetchColumn()) fail('Cet ami n\'est pas dans ce projet.');
    db()->prepare('INSERT INTO video_signals (project_id,from_user_id,to_user_id,type,payload) VALUES (?,?,?,?,?)')
        ->execute([$pid, $user['id'], $to, 'call', json_encode(['call_id'=>$callId,'mode'=>$mode], JSON_UNESCAPED_UNICODE)]);
    try {
        $pn = db()->prepare('SELECT name FROM projects WHERE id=?');
        $pn->execute([$pid]);
        $projectName = (string)$pn->fetchColumn();
        wp_notify_user(db(), $to, [
            'title' => 'Appel entrant — DIGITAL-PRIME',
            'body' => $user['display_name'] . ' vous appelle en ' . ($mode === 'audio' ? 'audio' : 'vidéo') . ' sur ' . ($projectName ?: 'un projet'),
            'tag' => 'dp-call-' . $callId,
            'url' => 'app.html',
        ]);
    } catch (Throwable $e) { /* la sonnerie dans l'appli reste prioritaire */ }
    respond(['ok'=>true]);
}

if (in_array($action, ['call_answer','call_decline','call_busy','call_cancel'], true) && $method === 'POST') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    $to = (int)($in['to_user_id'] ?? 0);
    $callId = trim((string)($in['call_id'] ?? ''));
    require_project($pid, $user['id']);
    if ($to <= 0) fail('Destinataire invalide.');
    if (!call_exists(db(), $pid, $to, (int)$user['id'], $callId)) fail('Appel introuvable.');
    db()->prepare('INSERT INTO video_signals (project_id,from_user_id,to_user_id,type,payload) VALUES (?,?,?,?,?)')
        ->execute([$pid, $user['id'], $to, $action, json_encode(['call_id'=>$callId], JSON_UNESCAPED_UNICODE)]);
    respond(['ok'=>true]);
}

if ($action === 'incoming' && $method === 'GET') {
    $since = (int)($_GET['since'] ?? 0);
    $pdo = db();
    $pdo->prepare("DELETE FROM video_signals WHERE to_user_id=? AND created_at < NOW() - INTERVAL '2 minutes'")->execute([$user['id']]);
    $stmt = $pdo->prepare("SELECT s.id,s.project_id,s.from_user_id,s.type,s.payload,
        p.name AS project_name,u.display_name AS caller_name,u.color AS caller_color
        FROM video_signals s
        JOIN projects p ON p.id=s.project_id
        JOIN users u ON u.id=s.from_user_id
        JOIN project_members pm ON pm.project_id=s.project_id AND pm.user_id=?
        WHERE s.to_user_id=? AND s.id>? AND s.type IN ('call','call_cancel')
        ORDER BY s.id ASC LIMIT 20");
    $stmt->execute([$user['id'], $user['id'], $since]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['payload'] = json_decode($r['payload'], true); }
    $latest = (int)$pdo->query('SELECT COALESCE(MAX(id),0) FROM video_signals WHERE to_user_id='.(int)$user['id'])->fetchColumn();
    respond(['ok'=>true,'signals'=>$rows,'latest'=>$latest]);
}

if ($action === 'responses' && $method === 'GET') {
    $from = (int)($_GET['from_user_id'] ?? 0);
    $since = (int)($_GET['since'] ?? 0);
    $pdo = db();
    $stmt = $pdo->prepare("SELECT s.id,s.project_id,s.type,s.payload FROM video_signals s
        JOIN project_members pm ON pm.project_id=s.project_id AND pm.user_id=?
        WHERE s.to_user_id=? AND s.from_user_id=? AND s.id>? AND s.type IN ('call_answer','call_decline','call_busy')
        ORDER BY s.id ASC LIMIT 20");
    $stmt->execute([$user['id'], $user['id'], $from, $since]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['payload'] = json_decode($r['payload'], true); }
    $latest = (int)$pdo->query('SELECT COALESCE(MAX(id),0) FROM video_signals WHERE to_user_id='.(int)$user['id'].' AND from_user_id='.$from)->fetchColumn();
    respond(['ok'=>true,'signals'=>$rows,'latest'=>$latest]);
}

fail('Action inconnue.', 404);
