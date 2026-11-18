<?php
require_once __DIR__ . '/config.php';
$user = require_login();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'list') {
    $pid = (int)($_GET['project_id'] ?? 0);
    require_project($pid, $user['id']);
    $stmt = db()->prepare("SELECT i.id,i.project_id,i.user_id,i.kind,i.title,i.filename,i.mime_type,i.size,i.content,i.parent_id,i.created_at,i.updated_at,
        u.display_name,u.username,u.color as user_color,
        (SELECT COUNT(*) FROM comments c WHERE c.item_id=i.id) as comment_count
        FROM items i JOIN users u ON u.id=i.user_id
        WHERE i.project_id = ? ORDER BY i.updated_at DESC");
    $stmt->execute([$pid]);
    respond(['ok' => true, 'items' => $stmt->fetchAll()]);
}

if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = db()->prepare("SELECT i.*, u.display_name,u.username,u.color as user_color FROM items i JOIN users u ON u.id=i.user_id WHERE i.id=?");
    $stmt->execute([$id]);
    $item = $stmt->fetch();
    if (!$item) fail('Introuvable.', 404);
    require_project((int)$item['project_id'], $user['id']);
    respond(['ok' => true, 'item' => $item]);
}

if ($method === 'POST' && $action === 'upload') {
    $pid = (int)($_POST['project_id'] ?? 0);
    require_project($pid, $user['id']);
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) fail('Fichier manquant ou invalide.');
    $f = $_FILES['file'];
    $max = 15 * 1024 * 1024;
    if ($f['size'] > $max) fail('Fichier trop volumineux (max 15 Mo).');
    $orig = basename((string)$f['name']);
    $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    $mime = function_exists('mime_content_type') ? (mime_content_type($f['tmp_name']) ?: 'application/octet-stream') : ($f['type'] ?: 'application/octet-stream');
    $stored = bin2hex(random_bytes(16)) . ($ext ? '.' . preg_replace('/[^a-z0-9]/','',$ext) : '');
    $dest = UPLOAD_PATH . '/' . $stored;
    if (!move_uploaded_file($f['tmp_name'], $dest)) fail("Échec de l'enregistrement.");
    $title = trim((string)($_POST['title'] ?? $orig));
    $title = mb_substr($title !== '' ? $title : $orig, 0, 120);
    $stmt = db()->prepare('INSERT INTO items (project_id,user_id,kind,title,filename,stored_name,mime_type,size) VALUES (?,?,?,?,?,?,?,?) RETURNING id');
    $stmt->execute([$pid, $user['id'], 'file', $title, $orig, $stored, $mime, (int)$f['size']]);
    respond(['ok' => true, 'id' => (int)$stmt->fetchColumn()]);
}

if ($method === 'POST' && $action === 'create_text') {
    $in = json_input();
    $pid = (int)($in['project_id'] ?? 0);
    require_project($pid, $user['id']);
    $title = trim((string)($in['title'] ?? 'Sans titre'));
    $content = (string)($in['content'] ?? '');
    $title = mb_substr($title !== '' ? $title : 'Sans titre', 0, 120);
    $stmt = db()->prepare('INSERT INTO items (project_id,user_id,kind,title,content,mime_type) VALUES (?,?,?,?,?,?) RETURNING id');
    $stmt->execute([$pid, $user['id'], 'text', $title, $content, 'text/plain']);
    respond(['ok' => true, 'id' => (int)$stmt->fetchColumn()]);
}

if ($method === 'POST' && $action === 'update_text') {
    $in = json_input();
    $id = (int)($in['id'] ?? 0);
    $stmt = db()->prepare('SELECT * FROM items WHERE id=?');
    $stmt->execute([$id]); $item = $stmt->fetch();
    if (!$item) fail('Introuvable.', 404);
    require_project((int)$item['project_id'], $user['id']);
    if ($item['kind'] !== 'text') fail("Ce n'est pas un texte.");
    $title = trim((string)($in['title'] ?? $item['title']));
    $content = (string)($in['content'] ?? $item['content']);
    $title = mb_substr($title !== '' ? $title : $item['title'], 0, 120);
    $saveAsNew = !empty($in['save_as_new']);
    if ($saveAsNew) {
        $stmt = db()->prepare('INSERT INTO items (project_id,user_id,kind,title,content,mime_type,parent_id) VALUES (?,?,?,?,?,?,?) RETURNING id');
        $stmt->execute([$item['project_id'], $user['id'], 'text', $title, $content, 'text/plain', $item['id']]);
        respond(['ok' => true, 'id' => (int)$stmt->fetchColumn(), 'new_version' => true]);
    } else {
        $stmt = db()->prepare("UPDATE items SET title=?, content=?, updated_at=NOW() WHERE id=?");
        $stmt->execute([$title, $content, $id]);
        respond(['ok' => true, 'id' => $id]);
    }
}

if ($method === 'GET' && $action === 'download') {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = db()->prepare('SELECT * FROM items WHERE id=?');
    $stmt->execute([$id]); $item = $stmt->fetch();
    if (!$item) fail('Introuvable.', 404);
    require_project((int)$item['project_id'], $user['id']);
    if ($item['kind'] === 'text') {
        $name = preg_replace('/[^a-zA-Z0-9_\-\. ]/u', '_', $item['title']) . '.txt';
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        echo $item['content'] ?? '';
        exit;
    } else {
        $path = UPLOAD_PATH . '/' . $item['stored_name'];
        if (!$item['stored_name'] || !file_exists($path)) fail('Fichier manquant.', 404);
        $name = preg_replace('/[\r\n"]/','', $item['filename'] ?: $item['title']);
        header('Content-Type: ' . ($item['mime_type'] ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . $name . '"');
        readfile($path);
        exit;
    }
}

if ($method === 'POST' && $action === 'delete') {
    $in = json_input();
    $id = (int)($in['id'] ?? 0);
    $stmt = db()->prepare('SELECT * FROM items WHERE id=?'); $stmt->execute([$id]); $item = $stmt->fetch();
    if (!$item) fail('Introuvable.', 404);
    $p = require_project((int)$item['project_id'], $user['id']);
    $can = ($item['user_id'] == $user['id']) || in_array($p['member_role'], ['owner','admin'], true);
    if (!$can) fail('Permission refusée.', 403);
    if ($item['kind'] === 'file' && $item['stored_name']) {
        $path = UPLOAD_PATH . '/' . $item['stored_name'];
        if (file_exists($path)) @unlink($path);
    }
    db()->prepare('DELETE FROM items WHERE id=?')->execute([$id]);
    respond(['ok' => true]);
}

fail('Action inconnue.', 404);
