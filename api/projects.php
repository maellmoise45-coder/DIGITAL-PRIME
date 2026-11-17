<?php
require_once __DIR__ . '/config.php';
$user = require_login();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'list') {
    $stmt = db()->prepare("SELECT p.*, pm.role as my_role,
        (SELECT COUNT(*) FROM items i WHERE i.project_id = p.id) as item_count,
        (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id) as member_count
        FROM projects p JOIN project_members pm ON pm.project_id = p.id
        WHERE pm.user_id = ? ORDER BY p.created_at DESC");
    $stmt->execute([$user['id']]);
    respond(['ok' => true, 'projects' => $stmt->fetchAll()]);
}

if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    $p = require_project($id, $user['id']);
    $members = db()->prepare("SELECT u.id, u.username, u.display_name, u.color, pm.role
        FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY pm.added_at");
    $members->execute([$id]);
    $p['members'] = $members->fetchAll();
    respond(['ok' => true, 'project' => $p]);
}

if ($method === 'POST' && $action === 'create') {
    $in = json_input();
    $name = trim((string)($in['name'] ?? ''));
    $desc = trim((string)($in['description'] ?? ''));
    if ($name === '') fail('Nom du projet requis.');
    $name = mb_substr($name, 0, 80); $desc = mb_substr($desc, 0, 500);
    $pdo = db();
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('INSERT INTO projects (name, description, owner_id) VALUES (?,?,?) RETURNING id');
    $stmt->execute([$name, $desc, $user['id']]);
    $pid = (int)$stmt->fetchColumn();
    $pdo->prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)')->execute([$pid, $user['id'], 'owner']);
    $pdo->commit();
    respond(['ok' => true, 'id' => $pid]);
}

if ($method === 'POST' && $action === 'add_member') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    $p = require_project($pid, $user['id']);
    if (!in_array($p['member_role'], ['owner','admin'], true)) fail('Permission refusée.', 403);
    $username = trim((string)($in['username'] ?? ''));
    $stmt = db()->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
    $stmt->execute([$username]);
    $target = $stmt->fetch();
    if (!$target) fail('Utilisateur introuvable.', 404);
    try {
        db()->prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?,?,?)')->execute([$pid, $target['id'], 'member']);
    } catch (PDOException $e) { /* already member (23505) */ }
    respond(['ok' => true]);
}

if ($method === 'POST' && $action === 'remove_member') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    $p = require_project($pid, $user['id']);
    $targetId = (int)($in['user_id'] ?? 0);
    if ($targetId === (int)$p['owner_id']) fail("Impossible de retirer le propriétaire.");
    $isSelf = $targetId === (int)$user['id'];
    if (!$isSelf && !in_array($p['member_role'], ['owner','admin'], true)) fail('Permission refusée.', 403);
    db()->prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')->execute([$pid, $targetId]);
    respond(['ok' => true]);
}

if ($method === 'GET' && $action === 'users') {
    $q = trim((string)($_GET['q'] ?? ''));
    $stmt = db()->prepare("SELECT id, username, display_name, color FROM users WHERE username ILIKE ? OR display_name ILIKE ? ORDER BY username LIMIT 20");
    $stmt->execute(['%'.$q.'%', '%'.$q.'%']);
    respond(['ok' => true, 'users' => $stmt->fetchAll()]);
}

fail('Action inconnue.', 404);
