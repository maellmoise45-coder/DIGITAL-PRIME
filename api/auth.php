<?php
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'register' && $method === 'POST') {
    $in = json_input();
    $username = trim((string)($in['username'] ?? ''));
    $display = trim((string)($in['display_name'] ?? $username));
    $password = (string)($in['password'] ?? '');
    $color = sanitize_color((string)($in['color'] ?? '#3b82f6'));
    if ($username === '' || !preg_match('/^[a-zA-Z0-9_\-]{3,30}$/', $username)) {
        fail("Nom d'utilisateur invalide (3-30 caractères, lettres/chiffres/_/-).");
    }
    if (strlen($password) < 4) fail('Mot de passe trop court (4 caractères min).');
    if ($display === '') $display = $username;
    $display = mb_substr($display, 0, 50);
    try {
        $stmt = db()->prepare('INSERT INTO users (username, display_name, password_hash, color) VALUES (?,?,?,?) RETURNING id');
        $stmt->execute([$username, $display, password_hash($password, PASSWORD_DEFAULT), $color]);
        $row = $stmt->fetch();
        $_SESSION['user_id'] = (int)$row['id'];
    } catch (PDOException $e) {
        if ($e->getCode() === '23505') fail("Ce nom d'utilisateur est déjà pris.", 409);
        throw $e;
    }
    respond(['ok' => true, 'user' => require_login()]);
}

if ($action === 'login' && $method === 'POST') {
    $in = json_input();
    $username = trim((string)($in['username'] ?? ''));
    $password = (string)($in['password'] ?? '');
    $stmt = db()->prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        fail('Identifiants incorrects.', 401);
    }
    $_SESSION['user_id'] = (int)$user['id'];
    unset($user['password_hash']);
    respond(['ok' => true, 'user' => $user]);
}

if ($action === 'logout' && $method === 'POST') {
    session_destroy();
    respond(['ok' => true]);
}

if ($action === 'me' && $method === 'GET') {
    $user = require_login();
    respond(['ok' => true, 'user' => $user]);
}

if ($action === 'profile' && $method === 'POST') {
    $user = require_login();
    $in = json_input();
    $display = trim((string)($in['display_name'] ?? $user['display_name']));
    $color = sanitize_color((string)($in['color'] ?? $user['color']));
    if ($display === '') $display = $user['username'];
    $display = mb_substr($display, 0, 50);
    $stmt = db()->prepare('UPDATE users SET display_name = ?, color = ? WHERE id = ?');
    $stmt->execute([$display, $color, $user['id']]);
    if (!empty($in['password'])) {
        if (strlen((string)$in['password']) < 4) fail('Mot de passe trop court.');
        $stmt = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $stmt->execute([password_hash((string)$in['password'], PASSWORD_DEFAULT), $user['id']]);
    }
    respond(['ok' => true, 'user' => require_login()]);
}

fail('Action inconnue.', 404);
