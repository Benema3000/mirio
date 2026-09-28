<?php
// Separate, time-only leaderboards. Scores and their tokens remain unchanged.
// Sharing nickname rules and the storage secret does not share token authority:
// the HMAC domain below includes both this protocol and the requested level.
require_once __DIR__ . '/scores.inc';

const MIRIO_TIMES_LEVELS = ['adventure' => 30000, 'sky' => 20000, 'ribbon' => 8000, 'kart' => 10000, 'marble' => 8000, 'tilt' => 8000, 'volcano' => 30000];
const MIRIO_TIMES_ADDED_LEVELS = ['marble', 'tilt', 'volcano'];
const MIRIO_TIMES_MAX = 86400000;
const MIRIO_TIMES_TOKEN_AGE = 86400;
const MIRIO_TIMES_SLACK_MS = 15000;
const MIRIO_TIMES_KEEP = 100;
const MIRIO_TIMES_SHOW = 10;
const MIRIO_TIMES_RATE = 10;
const MIRIO_TIMES_RATE_WINDOW = 600;

function mirio_times_level($level): bool
{
    return is_string($level) && array_key_exists($level, MIRIO_TIMES_LEVELS);
}

function mirio_times_fail(int $status, string $error, string $message): array
{
    return ['status' => $status, 'body' => ['ok' => false, 'error' => $error, 'message' => $message]];
}

function mirio_times_token(string $secret, string $level, int $now): string
{
    if (!mirio_times_level($level)) {
        throw new InvalidArgumentException('mirio times: unknown level');
    }
    $payload = $level . '.' . $now . '.' . bin2hex(random_bytes(16));
    return $payload . '.' . hash_hmac('sha256', 'mirio-time-v1|' . $payload, $secret);
}

function mirio_times_read_token($token, string $secret, string $level, int $now): ?array
{
    if (!mirio_times_level($level) || !is_string($token)
        || !preg_match('/^([a-z]+)\.(\d{1,12})\.([0-9a-f]{32})\.([0-9a-f]{64})$/', $token, $m)
        || $m[1] !== $level) {
        return null;
    }
    $payload = $m[1] . '.' . $m[2] . '.' . $m[3];
    if (!hash_equals(hash_hmac('sha256', 'mirio-time-v1|' . $payload, $secret), $m[4])) {
        return null;
    }
    $issued = (int) $m[2];
    if ($issued > $now + intdiv(MIRIO_TIMES_SLACK_MS, 1000) || $now - $issued > MIRIO_TIMES_TOKEN_AGE) {
        return null;
    }
    return ['t' => $issued, 'nonce' => $m[3], 'level' => $level];
}

function mirio_times_empty(): array
{
    return ['times' => array_fill_keys(array_keys(MIRIO_TIMES_LEVELS), []), 'used' => [], 'recent' => [], 'nextId' => 1];
}

/** Atomic replacement lets readers see a complete old or new list. */
function mirio_times_load(string $dir): array
{
    $path = $dir . '/times.json';
    $raw = @file_get_contents($path);
    if ($raw === false && !file_exists($path)) {
        return mirio_times_empty();
    }
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || !isset($data['times'], $data['used'], $data['recent'], $data['nextId'])
        || !is_array($data['times']) || !is_array($data['used']) || !is_array($data['recent'])
        || !is_int($data['nextId']) || $data['nextId'] < 1) {
        throw new RuntimeException('mirio times: unreadable ' . $path);
    }
    foreach (MIRIO_TIMES_LEVELS as $level => $minimum) {
        // Older files gain only the new board; existing rows and tokens stay intact.
        if (!array_key_exists($level, $data['times']) && in_array($level, MIRIO_TIMES_ADDED_LEVELS, true)) {
            $data['times'][$level] = [];
        }
        if (!isset($data['times'][$level]) || !is_array($data['times'][$level])) {
            throw new RuntimeException('mirio times: unreadable level in ' . $path);
        }
    }
    return $data;
}

/** One lock covers ranking, one-use tokens, and the rate limit across levels. */
function mirio_times_update(string $dir, callable $fn)
{
    mirio_scores_ensure_dir($dir);
    $lock = @fopen($dir . '/times.lock', 'c');
    if (!$lock) {
        throw new RuntimeException('mirio times: cannot open lock in ' . $dir);
    }
    if (!flock($lock, LOCK_EX)) {
        fclose($lock);
        throw new RuntimeException('mirio times: cannot lock ' . $dir);
    }
    try {
        $data = mirio_times_load($dir);
        $result = $fn($data);
        $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $tmp = $dir . '/times.json.' . bin2hex(random_bytes(8));
        if (file_put_contents($tmp, $encoded) !== strlen($encoded) || !rename($tmp, $dir . '/times.json')) {
            @unlink($tmp);
            throw new RuntimeException('mirio times: cannot save to ' . $dir);
        }
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/** Public rows never contain identifiers, client hashes, or token data. */
function mirio_times_top(array $data, string $level, int $count = MIRIO_TIMES_SHOW): array
{
    if (!mirio_times_level($level)) {
        throw new InvalidArgumentException('mirio times: unknown level');
    }
    $top = [];
    foreach (array_slice($data['times'][$level], 0, max(0, $count)) as $i => $entry) {
        $top[] = ['rank' => $i + 1, 'name' => $entry['name'], 'timeMs' => $entry['timeMs'], 'date' => $entry['date']];
    }
    return $top;
}

function mirio_times_get(string $dir, $level, int $now): array
{
    if (!mirio_times_level($level)) {
        return mirio_times_fail(400, 'level', 'Diese Strecke gibt es nicht.');
    }
    return ['status' => 200, 'body' => [
        'ok' => true, 'level' => $level,
        'top' => mirio_times_top(mirio_times_load($dir), $level),
        'token' => mirio_times_token(mirio_scores_secret($dir), $level, $now),
    ]];
}

/** Browser runs cannot prove completion; these checks deter casual spam/claims. */
function mirio_times_submit(string $dir, $input, string $client, int $now): array
{
    if (!is_array($input)) {
        return mirio_times_fail(400, 'bad_request', 'Das hat nicht geklappt.');
    }
    $level = $input['level'] ?? null;
    if (!mirio_times_level($level)) {
        return mirio_times_fail(400, 'level', 'Diese Strecke gibt es nicht.');
    }
    $secret = mirio_scores_secret($dir);
    $token = mirio_times_read_token($input['token'] ?? null, $secret, $level, $now);
    if (!$token) {
        return mirio_times_fail(400, 'token', 'Diese Runde ist zu alt oder gehört zu einer anderen Strecke. Spiel nochmal!');
    }
    $name = mirio_scores_clean_name($input['name'] ?? null);
    if ($name === null) {
        return mirio_times_fail(400, 'name', 'Dieser Name geht leider nicht. Nimm einen anderen (höchstens 16 Buchstaben oder Ziffern).');
    }
    $timeMs = $input['timeMs'] ?? null;
    $penaltyMs = array_key_exists('penaltyMs', $input) ? $input['penaltyMs'] : 0;
    if (!is_int($timeMs) || $timeMs < MIRIO_TIMES_LEVELS[$level] || $timeMs > MIRIO_TIMES_MAX
        || !is_int($penaltyMs) || $penaltyMs < 0 || $penaltyMs > $timeMs
        || $timeMs - $penaltyMs < MIRIO_TIMES_LEVELS[$level]) {
        return mirio_times_fail(400, 'result', 'Die Zeit stimmt so nicht.');
    }
    // Pauses make the token older than active play, which is fine. Repeated
    // recoveries can add any number of penalties within the total duration.
    // Validate active play against token age; rank the full time unchanged.
    // Claiming a penalty never reduces the submitted leaderboard time.
    $activeMs = $timeMs - $penaltyMs;
    if ($activeMs > max(0, $now - $token['t']) * 1000 + MIRIO_TIMES_SLACK_MS) {
        return mirio_times_fail(400, 'result', 'Die Zeit stimmt so nicht.');
    }
    $who = hash_hmac('sha256', 'mirio-time-client|' . $client, $secret);
    return mirio_times_update($dir, function (array &$data) use ($token, $who, $now, $name, $timeMs, $level) {
        $data['used'] = array_filter($data['used'], fn ($until) => $until > $now);
        $data['recent'] = array_values(array_filter($data['recent'], fn ($r) => $r['at'] > $now - MIRIO_TIMES_RATE_WINDOW));
        if (isset($data['used'][$token['nonce']])) {
            return mirio_times_fail(409, 'used', 'Diese Runde steht schon in der Bestenliste.');
        }
        if (count(array_filter($data['recent'], fn ($r) => $r['who'] === $who)) >= MIRIO_TIMES_RATE) {
            return mirio_times_fail(429, 'rate', 'Gerade kommen zu viele Einträge. Versuch es in ein paar Minuten nochmal.');
        }
        // The token remains valid through the last whole second of its age.
        $data['used'][$token['nonce']] = $token['t'] + MIRIO_TIMES_TOKEN_AGE + 1;
        $data['recent'][] = ['who' => $who, 'at' => $now];
        $entry = ['id' => $data['nextId']++, 'name' => $name, 'timeMs' => $timeMs, 'date' => gmdate('Y-m-d', $now), 'at' => $now];
        $times = $data['times'][$level];
        $times[] = $entry;
        // Lower is better. A monotonic ID resolves even identical submissions
        // in the same second, retaining the first arrival on exact ties.
        usort($times, fn ($a, $b) => [$a['timeMs'], $a['id']] <=> [$b['timeMs'], $b['id']]);
        $rank = null;
        foreach ($times as $i => $row) {
            if ($row['id'] === $entry['id']) {
                $rank = $i < MIRIO_TIMES_KEEP ? $i + 1 : null;
                break;
            }
        }
        $data['times'][$level] = array_slice($times, 0, MIRIO_TIMES_KEEP);
        return ['status' => 200, 'body' => [
            'ok' => true, 'level' => $level, 'timeMs' => $timeMs, 'rank' => $rank,
            'top' => mirio_times_top($data, $level),
        ]];
    });
}
