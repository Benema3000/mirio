<?php
// Mirio high scores: a public top list kept in one JSON file.
//
// A run fetches a signed token when it starts (GET) and hands it back with
// its result (POST). The server works out the points itself, and rejects a
// run that claims to be faster than the time since its token, a token used
// twice, and more than a few entries per address in ten minutes. That keeps
// casual cheating and spam out; a browser game cannot prove a score beyond
// that. Names are shown to children: short, letters and digits, no swearing.
//
// The file lives outside the web root (ROOT_PATH/data/mirio/ on the server),
// where no deploy's rsync --delete reaches it. Remove an entry by editing it.

const MIRIO_SCORES_KEEP = 100;
const MIRIO_SCORES_SHOW = 10;
// Glitzersteine in the level (level.js) plus the race (kart.js RACE_BITS);
// tests/mirio-world.test.mjs checks it.
const MIRIO_SCORES_MAX_BITS = 153;
// Far under any real run; only slows down a spammer. The real check is the
// token's age.
const MIRIO_SCORES_MIN_TIME = 30;
const MIRIO_SCORES_MAX_TIME = 86400;
const MIRIO_SCORES_TOKEN_AGE = 86400;
// Clock and network slack when comparing the claimed time with the token's age.
const MIRIO_SCORES_SLACK = 15;
const MIRIO_SCORES_RATE = 10;
const MIRIO_SCORES_RATE_WINDOW = 600;
const MIRIO_SCORES_NAME_MAX = 16;

// Matched against whole words, after mirio_scores_fold().
const MIRIO_SCORES_BLOCKED_WORDS = [
    'arsch', 'arschloch', 'hure', 'huren', 'nutte', 'schlampe', 'wichser', 'spast', 'spasti',
    'missgeburt', 'penner', 'bitch', 'shit', 'cunt', 'cock', 'pussy', 'whore', 'slut', 'fag',
    'faggot', 'retard', 'rape', 'porn', 'porno', 'sex', 'nazi', 'nazis', 'neger',
];
// Matched anywhere in the folded name: unambiguous even inside other words.
const MIRIO_SCORES_BLOCKED_PARTS = [
    'fick', 'fuck', 'scheiss', 'wichs', 'nigg', 'fotze', 'hitler', 'motherf', 'kanak',
];

/** Points for a run; main.js shows the same sum before it is sent. */
function mirio_scores_points(int $bits, int $seconds, int $place): int
{
    return $bits * 10 + ($place === 1 ? 500 : 200) + max(0, 900 - $seconds);
}

/** Lower case, leet digits to letters, only letters left: what the word lists match. */
function mirio_scores_fold(string $name): string
{
    $lower = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
    $lower = strtr($lower, ['ß' => 'ss', 'ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', '0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's']);
    return trim(preg_replace('/[^a-z]+/', ' ', $lower));
}

/** The name as shown, or null if it is not allowed. */
function mirio_scores_clean_name($name): ?string
{
    if (!is_string($name)) {
        return null;
    }
    if (class_exists('Normalizer')) {
        $name = Normalizer::normalize($name, Normalizer::FORM_C) ?: $name;
    }
    $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
    if (!preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._!-]{0,' . (MIRIO_SCORES_NAME_MAX - 1) . '}$/u', $name)) {
        return null;
    }
    $folded = mirio_scores_fold($name);
    $squashed = str_replace(' ', '', $folded);
    foreach (explode(' ', $folded) as $word) {
        if (in_array($word, MIRIO_SCORES_BLOCKED_WORDS, true)) {
            return null;
        }
    }
    foreach (MIRIO_SCORES_BLOCKED_PARTS as $part) {
        if (str_contains($squashed, $part)) {
            return null;
        }
    }
    return $name;
}

function mirio_scores_secret(string $dir): string
{
    $file = $dir . '/secret.key';
    $secret = @file_get_contents($file);
    if (is_string($secret) && strlen($secret) === 64) {
        return $secret;
    }
    mirio_scores_ensure_dir($dir);
    $secret = bin2hex(random_bytes(32));
    // Two first requests at once: the file that lands first wins, both read it back.
    $handle = @fopen($file, 'x');
    if ($handle) {
        fwrite($handle, $secret);
        fclose($handle);
        @chmod($file, 0600);
    }
    $stored = @file_get_contents($file);
    if (!is_string($stored) || strlen($stored) !== 64) {
        throw new RuntimeException('mirio scores: cannot keep a secret in ' . $dir);
    }
    return $stored;
}

function mirio_scores_ensure_dir(string $dir): void
{
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
        throw new RuntimeException('mirio scores: cannot create ' . $dir);
    }
}

function mirio_scores_token(string $secret, int $now): string
{
    $payload = $now . '.' . bin2hex(random_bytes(8));
    return $payload . '.' . hash_hmac('sha256', 'mirio|' . $payload, $secret);
}

/** ['t' => issued, 'nonce' => ...] for a genuine, unexpired token; null otherwise. */
function mirio_scores_read_token($token, string $secret, int $now): ?array
{
    if (!is_string($token) || !preg_match('/^(\d{1,12})\.([0-9a-f]{16})\.([0-9a-f]{64})$/', $token, $m)) {
        return null;
    }
    if (!hash_equals(hash_hmac('sha256', 'mirio|' . $m[1] . '.' . $m[2], $secret), $m[3])) {
        return null;
    }
    $issued = (int) $m[1];
    if ($issued > $now + MIRIO_SCORES_SLACK || $now - $issued > MIRIO_SCORES_TOKEN_AGE) {
        return null;
    }
    return ['t' => $issued, 'nonce' => $m[2]];
}

function mirio_scores_empty(): array
{
    return ['scores' => [], 'used' => [], 'recent' => []];
}

/** Runs $fn(&$data) on the stored data under an exclusive lock, and saves it. */
function mirio_scores_update(string $dir, callable $fn)
{
    mirio_scores_ensure_dir($dir);
    $lock = fopen($dir . '/scores.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) {
        throw new RuntimeException('mirio scores: cannot lock ' . $dir);
    }
    try {
        $data = mirio_scores_load($dir);
        $result = $fn($data);
        $tmp = $dir . '/scores.json.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE)) === false || !rename($tmp, $dir . '/scores.json')) {
            @unlink($tmp);
            throw new RuntimeException('mirio scores: cannot save to ' . $dir);
        }
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function mirio_scores_load(string $dir): array
{
    $raw = @file_get_contents($dir . '/scores.json');
    if ($raw === false) {
        return mirio_scores_empty();
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        // Never start over silently on a damaged file: that would lose the list.
        throw new RuntimeException('mirio scores: unreadable ' . $dir . '/scores.json');
    }
    return $data + mirio_scores_empty();
}

/** The top of the list as shown: rank, name, points, date. */
function mirio_scores_top(array $data, int $count = MIRIO_SCORES_SHOW): array
{
    $top = [];
    foreach (array_slice($data['scores'], 0, $count) as $i => $s) {
        $top[] = ['rank' => $i + 1, 'name' => $s['name'], 'points' => $s['points'], 'date' => $s['date']];
    }
    return $top;
}

/**
 * Checks and stores one run. $input is the decoded POST body; $client
 * identifies the sender for the rate limit (hashed, never stored as is).
 * Returns ['status' => HTTP status, 'body' => response].
 */
function mirio_scores_submit(string $dir, $input, string $client, int $now): array
{
    $fail = fn (int $status, string $error, string $message) => ['status' => $status, 'body' => ['ok' => false, 'error' => $error, 'message' => $message]];
    if (!is_array($input)) {
        return $fail(400, 'bad_request', 'Das hat nicht geklappt.');
    }
    $secret = mirio_scores_secret($dir);
    $token = mirio_scores_read_token($input['token'] ?? null, $secret, $now);
    if (!$token) {
        return $fail(400, 'token', 'Diese Runde ist zu alt. Spiel nochmal!');
    }
    $name = mirio_scores_clean_name($input['name'] ?? null);
    if ($name === null) {
        return $fail(400, 'name', 'Dieser Name geht leider nicht. Nimm einen anderen (höchstens 16 Buchstaben oder Ziffern).');
    }
    $bits = $input['bits'] ?? null;
    $time = $input['time'] ?? null;
    $place = $input['place'] ?? null;
    if (!is_int($bits) || $bits < 0 || $bits > MIRIO_SCORES_MAX_BITS
        || !(is_int($time) || is_float($time)) || $time < MIRIO_SCORES_MIN_TIME || $time > MIRIO_SCORES_MAX_TIME
        || !in_array($place, [1, 2], true)) {
        return $fail(400, 'result', 'Das Ergebnis stimmt so nicht.');
    }
    $seconds = (int) floor($time);
    if ($seconds > $now - $token['t'] + MIRIO_SCORES_SLACK) {
        return $fail(400, 'result', 'Das Ergebnis stimmt so nicht.');
    }
    $points = mirio_scores_points($bits, $seconds, $place);
    $who = hash_hmac('sha256', 'client|' . $client, $secret);

    return mirio_scores_update($dir, function (array &$data) use ($token, $who, $now, $name, $points, $bits, $seconds, $place, $fail) {
        $data['used'] = array_filter($data['used'], fn ($until) => $until > $now);
        $data['recent'] = array_values(array_filter($data['recent'], fn ($r) => $r['at'] > $now - MIRIO_SCORES_RATE_WINDOW));
        if (isset($data['used'][$token['nonce']])) {
            return $fail(409, 'used', 'Diese Runde steht schon in der Bestenliste.');
        }
        if (count(array_filter($data['recent'], fn ($r) => $r['who'] === $who)) >= MIRIO_SCORES_RATE) {
            return $fail(429, 'rate', 'Gerade kommen zu viele Einträge. Versuch es in ein paar Minuten nochmal.');
        }
        $data['used'][$token['nonce']] = $token['t'] + MIRIO_SCORES_TOKEN_AGE;
        $data['recent'][] = ['who' => $who, 'at' => $now];

        $entry = ['name' => $name, 'points' => $points, 'bits' => $bits, 'time' => $seconds, 'place' => $place, 'date' => gmdate('Y-m-d', $now), 'at' => $now];
        $scores = $data['scores'];
        $scores[] = $entry;
        // Best first; on a tie, whoever got there first.
        usort($scores, fn ($a, $b) => [$b['points'], $a['at']] <=> [$a['points'], $b['at']]);
        $rank = null;
        foreach ($scores as $i => $s) {
            if ($s === $entry) {
                $rank = $i + 1;
                break;
            }
        }
        $data['scores'] = array_slice($scores, 0, MIRIO_SCORES_KEEP);
        return ['status' => 200, 'body' => [
            'ok' => true,
            'points' => $points,
            'rank' => $rank !== null && $rank <= MIRIO_SCORES_KEEP ? $rank : null,
            'top' => mirio_scores_top($data),
        ]];
    });
}
