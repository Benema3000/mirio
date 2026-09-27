<?php
// Mirio high scores (see scores.inc).
//   GET  -> { ok, top: [{ rank, name, points, date }], token }
//   POST { token, name, bits, time, place } -> { ok, points, rank, top } or { ok: false, error, message }
require __DIR__ . '/scores.inc';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function mirio_scores_respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

$dir = getenv('MIRIO_SCORES_DIR') ?: dirname($_SERVER['DOCUMENT_ROOT']) . '/data/mirio';
$now = time();

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        mirio_scores_respond(200, [
            'ok' => true,
            'top' => mirio_scores_top(mirio_scores_load($dir)),
            'token' => mirio_scores_token(mirio_scores_secret($dir), $now),
        ]);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: GET, POST');
        mirio_scores_respond(405, ['ok' => false, 'error' => 'method', 'message' => 'Nur GET und POST.']);
    }
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if ($raw === false || strlen($raw) > 4096) {
        mirio_scores_respond(413, ['ok' => false, 'error' => 'bad_request', 'message' => 'Das hat nicht geklappt.']);
    }
    $result = mirio_scores_submit($dir, json_decode($raw, true), $_SERVER['REMOTE_ADDR'] ?? '', $now);
    mirio_scores_respond($result['status'], $result['body']);
} catch (Throwable $e) {
    error_log($e->getMessage());
    mirio_scores_respond(503, ['ok' => false, 'error' => 'unavailable', 'message' => 'Die Bestenliste ist gerade nicht erreichbar.']);
}
