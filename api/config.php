<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');

define('BASE_PATH', dirname(__DIR__));
define('UPLOAD_PATH', BASE_PATH . '/uploads');

// Configuration PostgreSQL (modifiable via api/config.local.php ou variables d'environnement)
$DB_HOST = getenv('DB_HOST') ?: '127.0.0.1';
$DB_PORT = getenv('DB_PORT') ?: '5432';
$DB_NAME = getenv('DB_NAME') ?: 'digital_prime';
$DB_USER = getenv('DB_USER') ?: 'postgres';
$DB_PASS = getenv('DB_PASS') ?: 'postgres';

$localConfig = __DIR__ . '/config.local.php';
if (file_exists($localConfig)) {
    require $localConfig; // peut redéfinir $DB_HOST,$DB_PORT,$DB_NAME,$DB_USER,$DB_PASS
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        global $DB_HOST, $DB_PORT, $DB_NAME, $DB_USER, $DB_PASS;
        $dsn = "pgsql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME}";
        try {
            $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Connexion base de données impossible. Vérifiez PostgreSQL et api/config.local.php.', 'detail' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    return $pdo;
}

function json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $code = 400): void {
    respond(['ok' => false, 'error' => $message], $code);
}

function require_login(): array {
    if (empty($_SESSION['user_id'])) fail('Non connecté.', 401);
    $stmt = db()->prepare('SELECT id, username, display_name, color, created_at FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) { session_destroy(); fail('Session invalide.', 401); }
    return $user;
}

function project_access(int $projectId, int $userId): ?array {
    $stmt = db()->prepare('SELECT p.*, pm.role as member_role FROM projects p
        JOIN project_members pm ON pm.project_id = p.id
        WHERE p.id = ? AND pm.user_id = ?');
    $stmt->execute([$projectId, $userId]);
    $p = $stmt->fetch();
    return $p ?: null;
}

function require_project(int $projectId, int $userId): array {
    $p = project_access($projectId, $userId);
    if (!$p) fail('Projet introuvable ou accès refusé.', 403);
    return $p;
}

function sanitize_color(string $c): string {
    if (preg_match('/^#[0-9a-fA-F]{6}$/', $c)) return strtolower($c);
    return '#3b82f6';
}

function insert_id(PDO $pdo, string $table, string $col = 'id') {
    // PostgreSQL: utiliser RETURNING dans les requêtes; fallback sequence
    try { return $pdo->lastInsertId($table . '_' . $col . '_seq'); } catch (Throwable $e) { return $pdo->lastInsertId(); }
}
