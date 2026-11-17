<?php
require_once __DIR__ . '/config.php';
$user = require_login();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'list') {
    $itemId = (int)($_GET['item_id'] ?? 0);
    $stmt = db()->prepare('SELECT i.project_id FROM items i WHERE i.id=?');
    $stmt->execute([$itemId]); $it = $stmt->fetch();
    if (!$it) fail('Élément introuvable.', 404);
    require_project((int)$it['project_id'], $user['id']);
    $stmt = db()->prepare("SELECT c.*, u.display_name,u.username,u.color as user_color FROM comments c JOIN users u ON u.id=c.user_id WHERE c.item_id=? ORDER BY c.created_at ASC");
    $stmt->execute([$itemId]);
    respond(['ok' => true, 'comments' => $stmt->fetchAll()]);
}

if ($method === 'POST' && $action === 'add') {
    $in = json_input();
    $itemId = (int)($in['item_id'] ?? 0);
    $body = trim((string)($in['body'] ?? ''));
    if ($body === '') fail('Commentaire vide.');
    $body = mb_substr($body, 0, 2000);
    $stmt = db()->prepare('SELECT i.project_id FROM items i WHERE i.id=?');
    $stmt->execute([$itemId]); $it = $stmt->fetch();
    if (!$it) fail('Élément introuvable.', 404);
    require_project((int)$it['project_id'], $user['id']);
    $stmt = db()->prepare('INSERT INTO comments (item_id,user_id,body) VALUES (?,?,?) RETURNING id');
    $stmt->execute([$itemId, $user['id'], $body]);
    respond(['ok' => true, 'id' => (int)$stmt->fetchColumn()]);
}

if ($method === 'POST' && $action === 'delete') {
    $in = json_input();
    $id = (int)($in['id'] ?? 0);
    $stmt = db()->prepare('SELECT c.*, i.project_id FROM comments c JOIN items i ON i.id=c.item_id WHERE c.id=?');
    $stmt->execute([$id]); $c = $stmt->fetch();
    if (!$c) fail('Introuvable.', 404);
    $p = require_project((int)$c['project_id'], $user['id']);
    $can = ($c['user_id'] == $user['id']) || in_array($p['member_role'], ['owner','admin'], true);
    if (!$can) fail('Permission refusée.', 403);
    db()->prepare('DELETE FROM comments WHERE id=?')->execute([$id]);
    respond(['ok' => true]);
}

fail('Action inconnue.', 404);
