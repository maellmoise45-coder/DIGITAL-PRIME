<?php
declare(strict_types=1);

// Web Push (RFC 8291 + RFC 8188) en PHP natif, sans dépendance externe.

function wp_b64url_encode(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function wp_b64url_decode(string $s): string {
    $s = strtr($s, '-_', '+/');
    $decoded = base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $decoded === false ? '' : $decoded;
}

function wp_der_len(int $n): string {
    if ($n < 128) return chr($n);
    $bytes = '';
    while ($n > 0) { $bytes = chr($n & 0xff) . $bytes; $n >>= 8; }
    return chr(0x80 | strlen($bytes)) . $bytes;
}

function wp_raw_pub_to_pem(string $raw): string {
    $alg = "\x06\x07\x2A\x86\x48\xCE\x3D\x02\x01";      // id-ecPublicKey
    $curve = "\x06\x08\x2A\x86\x48\xCE\x3D\x03\x01\x07"; // prime256v1
    $algSeq = "\x30" . wp_der_len(strlen($alg . $curve)) . $alg . $curve;
    $bit = "\x00" . $raw;
    $bitStr = "\x03" . wp_der_len(strlen($bit)) . $bit;
    $spki = "\x30" . wp_der_len(strlen($algSeq . $bitStr)) . $algSeq . $bitStr;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function wp_ec_raw_pub(OpenSSLAsymmetricKey $key): string {
    $d = openssl_pkey_get_details($key);
    if (!$d || empty($d['ec']['x']) || empty($d['ec']['y'])) {
        throw new RuntimeException('Clé EC invalide.');
    }
    return "\x04"
        . str_pad($d['ec']['x'], 32, "\x00", STR_PAD_LEFT)
        . str_pad($d['ec']['y'], 32, "\x00", STR_PAD_LEFT);
}

function wp_hkdf_expand(string $prk, string $info, int $len): string {
    $out = ''; $t = ''; $i = 1;
    while (strlen($out) < $len) {
        $t = hash_hmac('sha256', $t . $info . chr($i), $prk, true);
        $out .= $t;
        $i++;
    }
    return substr($out, 0, $len);
}

function wp_der_sig_to_raw(string $der): string {
    $p = 0;
    if (ord($der[$p++] ?? "\x00") !== 0x30) throw new RuntimeException('Signature VAPID invalide.');
    $l = ord($der[$p++]);
    if ($l & 0x80) { $n = $l & 0x7f; $l = 0; for ($i = 0; $i < $n; $i++) $l = ($l << 8) | ord($der[$p++]); }
    $readInt = function () use (&$p, $der): string {
        if (ord($der[$p++] ?? "\x00") !== 0x02) throw new RuntimeException('Signature VAPID invalide.');
        $l = ord($der[$p++]);
        if ($l & 0x80) { $n = $l & 0x7f; $l = 0; for ($i = 0; $i < $n; $i++) $l = ($l << 8) | ord($der[$p++]); }
        $v = substr($der, $p, $l); $p += $l;
        $v = ltrim($v, "\x00");
        if ($v === '') $v = "\x00";
        return str_pad($v, 32, "\x00", STR_PAD_LEFT);
    };
    return $readInt() . $readInt();
}

function wp_vapid_keys(): array {
    static $keys = null;
    if ($keys !== null) return $keys;

    $public = (string)(getenv('VAPID_PUBLIC') ?: '');
    $privateB64 = (string)(getenv('VAPID_PRIVATE_B64') ?: '');
    $subject = (string)(getenv('VAPID_SUBJECT') ?: 'mailto:digitalelect@example.com');
    $local = __DIR__ . '/vapid.local.php';
    if (file_exists($local)) require $local;
    if (isset($VAPID_PUBLIC) && $VAPID_PUBLIC) $public = $VAPID_PUBLIC;
    if (isset($VAPID_PRIVATE_B64) && $VAPID_PRIVATE_B64) $privateB64 = $VAPID_PRIVATE_B64;
    if (isset($VAPID_SUBJECT) && $VAPID_SUBJECT) $subject = $VAPID_SUBJECT;

    if (!$public || !$privateB64) throw new RuntimeException('Clés VAPID absentes.');
    $privatePem = base64_decode($privateB64, true);
    $private = $privatePem === false ? false : openssl_pkey_get_private($privatePem);
    if (!$private) throw new RuntimeException('Clé privée VAPID invalide.');

    $keys = ['public' => $public, 'private' => $private, 'subject' => $subject];
    return $keys;
}

function wp_vapid_jwt(string $audience): string {
    $k = wp_vapid_keys();
    $header = wp_b64url_encode('{"typ":"JWT","alg":"ES256"}');
    $payload = wp_b64url_encode((string)json_encode([
        'aud' => $audience,
        'exp' => time() + 900,
        'sub' => $k['subject'],
    ], JSON_UNESCAPED_SLASHES));
    $input = $header . '.' . $payload;
    $der = '';
    if (!openssl_sign($input, $der, $k['private'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Signature VAPID impossible.');
    }
    return $input . '.' . wp_b64url_encode(wp_der_sig_to_raw($der));
}

function wp_encrypt_payload(string $payload, string $uaRaw, string $authRaw): array {
    if (strlen($uaRaw) !== 65 || substr($uaRaw, 0, 1) !== "\x04") throw new RuntimeException('Clé abonné invalide.');
    if (strlen($authRaw) < 16) throw new RuntimeException('Secret abonné invalide.');

    $ephem = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    if (!$ephem) throw new RuntimeException('Génération de clé impossible.');
    $asRaw = wp_ec_raw_pub($ephem);

    $uaKey = openssl_pkey_get_public(wp_raw_pub_to_pem($uaRaw));
    if (!$uaKey) throw new RuntimeException('Clé publique abonné invalide.');
    $shared = openssl_pkey_derive($uaKey, $ephem, 32);
    if (!$shared || strlen($shared) < 32) throw new RuntimeException('Échange ECDH impossible.');
    $shared = substr($shared, 0, 32);

    $prkKey = hash_hmac('sha256', $shared, $authRaw, true);
    $keyInfo = "WebPush: info\x00" . $uaRaw . $asRaw;
    $cekInput = wp_hkdf_expand($prkKey, $keyInfo, 32);

    $salt = random_bytes(16);
    $prk = hash_hmac('sha256', $cekInput, $salt, true);
    $cek = wp_hkdf_expand($prk, "Content-Encoding: aes128gcm\x00", 16);
    $nonce = wp_hkdf_expand($prk, "Content-Encoding: nonce\x00", 12);

    $recordSize = 4096;
    $plain = $payload . "\x02"; // délimiteur de padding, pas de padding supplémentaire
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($cipher === false) throw new RuntimeException('Chiffrement impossible.');

    $body = $salt . pack('N', $recordSize) . chr(strlen($asRaw)) . $asRaw . $cipher . $tag;
    return ['body' => $body];
}

function wp_send(string $endpoint, string $p256dh, string $auth, array $payload): array {
    $uaRaw = wp_b64url_decode($p256dh);
    $authRaw = wp_b64url_decode($auth);
    $enc = wp_encrypt_payload((string)json_encode($payload, JSON_UNESCAPED_UNICODE), $uaRaw, $authRaw);

    $parts = parse_url($endpoint);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) throw new RuntimeException('Endpoint invalide.');
    $audience = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    $jwt = wp_vapid_jwt($audience);

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $enc['body'],
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'Content-Length: ' . strlen($enc['body']),
            'TTL: 3600',
            'Urgency: high',
            'Authorization: vapid t=' . $jwt . ', k=' . wp_vapid_keys()['public'],
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
    ]);
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($error) throw new RuntimeException($error);
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status];
}

function wp_notify_user(PDO $pdo, int $userId, array $payload): int {
    $stmt = $pdo->prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
    $stmt->execute([$userId]);
    $sent = 0;
    foreach ($stmt->fetchAll() as $row) {
        try {
            $r = wp_send($row['endpoint'], $row['p256dh'], $row['auth'], $payload);
            if ($r['ok']) { $sent++; continue; }
            if (in_array($r['status'], [404, 410], true)) {
                $pdo->prepare('DELETE FROM push_subscriptions WHERE id = ?')->execute([$row['id']]);
            }
        } catch (Throwable $e) {
            error_log('Web Push: ' . $e->getMessage());
        }
    }
    return $sent;
}
