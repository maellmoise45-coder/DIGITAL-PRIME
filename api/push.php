<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/webpush.php';

$user = require_login();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($action === 'key' && $method === 'GET') {
    $keys = wp_vapid_keys();
    respond(['ok' => true, 'key' => $keys['public']]);
}

if ($action === 'subscribe' && $method === 'POST') {
    $in = json_input();
    $endpoint = trim((string)($in['endpoint'] ?? ''));
    $p256dh = trim((string)($in['keys']['p256dh'] ?? ''));
    $auth = trim((string)($in['keys']['auth'] ?? ''));
    if ($endpoint === '' || $p256dh === '' || $auth === '') fail('Abonnement invalide.');
    db()->prepare('INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth)
        VALUES (?,?,?,?)
        ON CONFLICT(user_id,endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, created_at=NOW()')
        ->execute([$user['id'], $endpoint, $p256dh, $auth]);
    respond(['ok' => true]);
}

if ($action === 'unsubscribe' && $method === 'POST') {
    $in = json_input();
    $endpoint = trim((string)($in['endpoint'] ?? ''));
    if ($endpoint !== '') {
        db()->prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?')->execute([$user['id'], $endpoint]);
    } else {
        db()->prepare('DELETE FROM push_subscriptions WHERE user_id=?')->execute([$user['id']]);
    }
    respond(['ok' => true]);
}

if ($action === 'test' && $method === 'POST') {
    $sent = wp_notify_user(db(), (int)$user['id'], [
        'title' => 'DIGITAL-PRIME',
        'body' => 'Notifications activées ✅ Vous recevrez les appels même page fermée.',
        'tag' => 'dp-test-' . time(),
        'url' => 'app.html',
    ]);
    respond(['ok' => true, 'sent' => $sent]);
}

fail('Action inconnue.', 404);
