<?php
// GET ?level=adventure|sky|ribbon|kart -> {ok, level, top, token}
// POST {level, token, name, timeMs} -> {ok, level, timeMs, rank, top}
require __DIR__ . '/times.inc';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function mirio_times_respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

// The production default stays outside the deployed web root. File names
// times.json/times.lock are separate from legacy scores.json/scores.lock.
$dir = getenv('MIRIO_TIMES_DIR') ?: (getenv('MIRIO_SCORES_DIR') ?: dirname($_SERVER['DOCUMENT_ROOT']) . '/data/mirio');
$now = time();

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $result = mirio_times_get($dir, $_GET['level'] ?? null, $now);
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input', false, null, 0, 4097);
        if ($raw === false || strlen($raw) > 4096) {
            $result = mirio_times_fail(413, 'bad_request', 'Das hat nicht geklappt.');
        } else {
            $result = mirio_times_submit($dir, json_decode($raw, true), $_SERVER['REMOTE_ADDR'] ?? '', $now);
        }
    } else {
        header('Allow: GET, POST');
        $result = mirio_times_fail(405, 'method', 'Nur GET und POST.');
    }
    mirio_times_respond($result['status'], $result['body']);
} catch (Throwable $e) {
    error_log($e->getMessage());
    mirio_times_respond(503, ['ok' => false, 'error' => 'unavailable', 'message' => 'Die Bestenliste ist gerade nicht erreichbar.']);
}
