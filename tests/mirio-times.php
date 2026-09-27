<?php
// Run: php tests/mirio-times.php. All files live in an isolated temporary dir.
declare(strict_types=1);
require __DIR__ . '/../api/times.inc';

$checks = 0;
function check(bool $ok, string $what): void
{
    global $checks;
    if (!$ok) {
        throw new RuntimeException('FAIL: ' . $what);
    }
    $checks++;
    echo "ok   $what\n";
}

function time_run(string $dir, int $now, string $level = 'adventure', array $fields = [], int $age = 300): array
{
    return $fields + ['level' => $level, 'token' => mirio_times_token(mirio_scores_secret($dir), $level, $now - $age),
        'name' => 'Miro', 'timeMs' => 120000];
}

function remove_test_dir(string $dir): void
{
    foreach (glob($dir . '/*') ?: [] as $path) {
        is_dir($path) ? remove_test_dir($path) : unlink($path);
    }
    @rmdir($dir);
}

$dir = sys_get_temp_dir() . '/mirio-times-test-' . bin2hex(random_bytes(8));
$now = 1_800_000_000;
$client = '203.0.113.7';

try {
    $empty = mirio_times_get($dir, 'adventure', $now);
    check($empty['status'] === 200 && $empty['body']['ok'] && $empty['body']['level'] === 'adventure' && $empty['body']['top'] === [], 'GET starts genuinely empty and issues a token for the requested level');
    foreach ([null, '', 'other', '__proto__', ['sky'], 1] as $bad) {
        check(mirio_times_get($dir, $bad, $now)['body']['error'] === 'level', 'GET rejects an unknown or malformed level: ' . json_encode($bad));
    }
    $secret = mirio_scores_secret($dir);
    $token = mirio_times_token($secret, 'sky', $now);
    check(mirio_times_read_token($token, $secret, 'sky', $now + 10)['t'] === $now, 'a signed token reads back for its own level');
    check(mirio_times_read_token($token, $secret, 'ribbon', $now) === null, 'tokens cannot cross levels');
    check(mirio_times_read_token(str_replace('sky.', 'ribbon.', $token), $secret, 'ribbon', $now) === null, 'changing a level inside a token breaks the signature');
    check(mirio_times_read_token($token, str_repeat('0', 64), 'sky', $now) === null, 'another secret cannot validate a token');
    check(mirio_times_read_token(substr($token, 0, -1) . 'x', $secret, 'sky', $now) === null, 'a malformed signature is refused');
    check(mirio_times_read_token($token, $secret, 'sky', $now + MIRIO_TIMES_TOKEN_AGE + 1) === null, 'expired tokens are refused');
    check(mirio_times_read_token(mirio_times_token($secret, 'sky', $now + 16), $secret, 'sky', $now) === null, 'tokens too far in the future are refused');
    check(mirio_times_read_token(mirio_scores_token($secret, $now), $secret, 'sky', $now) === null, 'legacy score tokens cannot authorize time entries');
    check(mirio_scores_read_token($token, $secret, $now) === null, 'time tokens cannot authorize legacy score entries');

    $firstInput = time_run($dir, $now, 'adventure', ['name' => '  Miro   2 ']);
    $first = mirio_times_submit($dir, $firstInput, $client, $now);
    check($first['status'] === 200 && $first['body']['level'] === 'adventure' && $first['body']['timeMs'] === 120000 && $first['body']['rank'] === 1, 'a completed run records milliseconds and rank');
    check($first['body']['top'][0]['name'] === 'Miro 2', 'inherited nickname rules normalize whitespace');
    check(mirio_times_submit($dir, $firstInput, $client, $now)['status'] === 409, 'the same run can only be submitted once');
    $better = mirio_times_submit($dir, time_run($dir, $now, 'adventure', ['name' => 'Zoë-Jö_2.!', 'timeMs' => 119999]), $client, $now);
    check($better['body']['rank'] === 1, 'one millisecond faster goes above');
    $tie = mirio_times_submit($dir, time_run($dir, $now, 'adventure', ['name' => 'Miro 2']), $client, $now);
    check($tie['body']['rank'] === 3, 'identical names and times in the same second retain arrival order and the correct new rank');
    check(array_column($tie['body']['top'], 'timeMs') === [119999, 120000, 120000] && array_column($tie['body']['top'], 'rank') === [1, 2, 3], 'the public top list is fastest first');
    check(array_keys($tie['body']['top'][0]) === ['rank', 'name', 'timeMs', 'date'] && $tie['body']['top'][0]['date'] === gmdate('Y-m-d', $now), 'public rows expose only rank, nickname, milliseconds and UTC date');
    $sky = mirio_times_submit($dir, time_run($dir, $now, 'sky', ['timeMs' => 20000]), $client, $now);
    check($sky['body']['rank'] === 1 && count($sky['body']['top']) === 1 && count(mirio_times_get($dir, 'adventure', $now)['body']['top']) === 3, 'each course has an independent leaderboard');

    foreach (MIRIO_TIMES_LEVELS as $level => $minimum) {
        check(mirio_times_submit($dir, time_run($dir, $now, $level, ['timeMs' => $minimum - 1]), $client, $now)['body']['error'] === 'result', "rejects times below the $level conservative minimum");
        check(mirio_times_submit($dir, time_run($dir, $now, $level, ['timeMs' => $minimum]), 'minimum-' . $level, $now)['status'] === 200, "accepts the $level minimum");
    }
    foreach ([null, '30000', 30000.1, true, 0, -1, INF, NAN, MIRIO_TIMES_MAX + 1] as $bad) {
        check(mirio_times_submit($dir, time_run($dir, $now, 'adventure', ['timeMs' => $bad]), $client, $now)['body']['error'] === 'result', 'rejects invalid or noninteger milliseconds: ' . var_export($bad, true));
    }
    $maxRun = time_run($dir, $now, 'adventure', ['timeMs' => MIRIO_TIMES_MAX], 86400);
    check(mirio_times_submit($dir, $maxRun, 'long-run', $now)['status'] === 200, 'a 24-hour time and token on their inclusive boundary are accepted');
    check(mirio_times_submit($dir, $maxRun, 'long-run', $now)['status'] === 409, 'the final valid token second still has replay protection');
    check(mirio_times_submit($dir, $maxRun, 'long-run', $now + 1)['body']['error'] === 'token', 'the same token expires on the following second');
    check(mirio_times_submit($dir, time_run($dir, $now, 'adventure', ['timeMs' => 120000, 'penaltyMs' => 30000], 90), 'penalty', $now)['status'] === 200, 'reported safety penalties may exceed the wall-clock age');
    check(mirio_times_submit($dir, time_run($dir, $now, 'adventure', ['timeMs' => 180000], 90), $client, $now)['body']['error'] === 'result', 'active time beyond the token age plus clock slack is refused');
    check(mirio_times_submit($dir, time_run($dir, $now, 'sky', ['timeMs' => 20000], 3600), 'pause', $now)['status'] === 200, 'a long pause does not invalidate a short active time');

    $penaltyDir = $dir . '/penalties';
    check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'sky', ['timeMs' => 110000]), 'clean-flight', $now)['status'] === 200, 'clients omitting penaltyMs retain zero-penalty behavior');
    // Reproduced with the real sky rules: all 20 balloon contacts, with boosts.
    $balloons = mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'sky', ['timeMs' => 128109, 'penaltyMs' => 50000], 81), 'balloons', $now);
    check($balloons['status'] === 200 && $balloons['body']['timeMs'] === 128109, '20 balloon penalties do not reject a genuine 78.109-second flight');
    check($balloons['body']['rank'] === 2 && array_column($balloons['body']['top'], 'timeMs') === [110000, 128109], 'penalties remain in ranked totals even when active play was faster');
    check(array_keys($balloons['body']['top'][1]) === ['rank', 'name', 'timeMs', 'date'], 'penalty accounting does not add private validation fields to public rows');
    $recoveries = mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'ribbon', ['timeMs' => 662000, 'penaltyMs' => 600000], 65), 'recoveries', $now);
    check($recoveries['status'] === 200 && $recoveries['body']['timeMs'] === 662000, 'many honest recoveries are accepted without a percentage or 60-second cap');
    check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'sky', ['timeMs' => 30000, 'penaltyMs' => 0], 30), 'zero-penalty', $now)['status'] === 200, 'explicit integer zero penalties are valid');
    foreach (MIRIO_TIMES_LEVELS as $level => $minimum) {
        $fields = ['timeMs' => $minimum + 2500, 'penaltyMs' => 2500];
        check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, $level, $fields, intdiv($minimum, 1000)), 'active-min-' . $level, $now)['status'] === 200, "active time at the $level minimum is accepted with penalties");
        $fields['penaltyMs']++;
        check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, $level, $fields), $client, $now)['body']['error'] === 'result', "penalties cannot disguise active time below the $level minimum");
    }
    foreach ([null, false, true, '0', '5000', 0.0, 2.5, -1, INF, NAN, [], 120001] as $bad) {
        check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'adventure', ['penaltyMs' => $bad]), $client, $now)['body']['error'] === 'result', 'rejects invalid or out-of-range penalty milliseconds: ' . var_export($bad, true));
    }
    check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'sky', ['timeMs' => 20000, 'penaltyMs' => 20000]), $client, $now)['body']['error'] === 'result', 'an all-penalty result has no valid active play');
    foreach ([0, 700000] as $penalty) {
        $fields = ['timeMs' => 105000 + $penalty, 'penaltyMs' => $penalty];
        check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'adventure', $fields, 90), 'slack-' . $penalty, $now)['status'] === 200, "active time may reach exactly 15 seconds beyond token age with $penalty penalty ms");
        $fields['timeMs']++;
        check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'adventure', $fields, 90), $client, $now)['body']['error'] === 'result', "one extra active millisecond is refused with $penalty penalty ms");
    }
    $maxPenalty = ['timeMs' => MIRIO_TIMES_MAX, 'penaltyMs' => MIRIO_TIMES_MAX - MIRIO_TIMES_LEVELS['ribbon']];
    check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'ribbon', $maxPenalty, 8), 'maximum-penalty', $now)['status'] === 200, 'penalties may fill the duration limit while preserving minimum active play');
    $maxPenalty['timeMs']++;
    check(mirio_times_submit($penaltyDir, time_run($penaltyDir, $now, 'ribbon', $maxPenalty, 8), $client, $now)['body']['error'] === 'result', 'penalties never extend the 24-hour total-time limit');

    foreach (['', '-Miro', str_repeat('a', 17), '<b>x</b>', 'Miro😀', 'Ar5ch', 'f u c k', 'Mr H1tler', 'SEX', 12] as $bad) {
        check(mirio_times_submit($dir, time_run($dir, $now, 'sky', ['name' => $bad]), $client, $now)['body']['error'] === 'name', 'inherited nickname safety rejects ' . json_encode($bad, JSON_UNESCAPED_UNICODE));
    }
    check(mirio_times_submit($dir, null, $client, $now)['body']['error'] === 'bad_request', 'non-JSON input is rejected');
    check(mirio_times_submit($dir, ['level' => '../sky'], $client, $now)['body']['error'] === 'level', 'a level cannot become a file path');
    check(mirio_times_submit($dir, time_run($dir, $now, 'sky', ['token' => null]), $client, $now)['body']['error'] === 'token', 'missing tokens are rejected');
    $wrongCourse = time_run($dir, $now, 'sky');
    $wrongCourse['level'] = 'ribbon';
    check(mirio_times_submit($dir, $wrongCourse, $client, $now)['body']['error'] === 'token', 'POST enforces the signed course scope');
    $retry = time_run($dir, $now, 'sky', ['name' => 'Arschloch']);
    check(mirio_times_submit($dir, $retry, 'retry', $now)['body']['error'] === 'name', 'a rejected nickname leaves the entry unsent');
    $retry['name'] = 'Barsch';
    check(mirio_times_submit($dir, $retry, 'retry', $now)['status'] === 200, 'correcting the nickname can reuse an unsubmitted token');

    $rateDir = $dir . '/rate';
    for ($i = 0; $i < MIRIO_TIMES_RATE; $i++) {
        $level = array_keys(MIRIO_TIMES_LEVELS)[$i % count(MIRIO_TIMES_LEVELS)];
        check(mirio_times_submit($rateDir, time_run($rateDir, $now, $level), $client, $now)['status'] === 200, 'rate allowance accepts entry ' . ($i + 1));
    }
    $rateRetry = time_run($rateDir, $now, 'ribbon');
    check(mirio_times_submit($rateDir, $rateRetry, $client, $now)['status'] === 429, 'the eleventh submission across all levels waits');
    check(mirio_times_submit($rateDir, time_run($rateDir, $now), '198.51.100.1', $now)['status'] === 200, 'another address retains its allowance');
    check(mirio_times_submit($rateDir, $rateRetry, $client, $now + MIRIO_TIMES_RATE_WINDOW)['status'] === 200, 'a rate-limited token remains usable when the window clears');
    check(!str_contains((string) file_get_contents($rateDir . '/times.json'), $client), 'raw client addresses are not stored');

    // Legacy files and data are intentionally independent, even in one dir.
    $legacy = json_encode(['scores' => [['name' => 'Old friend', 'points' => 123]], 'used' => [], 'recent' => []]);
    file_put_contents($dir . '/scores.json', $legacy);
    $keepDir = $dir . '/keep';
    for ($i = 0; $i <= MIRIO_TIMES_KEEP; $i++) {
        $result = mirio_times_submit($keepDir, time_run($keepDir, $now, 'ribbon', ['name' => 'Kind ' . $i, 'timeMs' => 10000 + $i]), 'keep-' . $i, $now);
    }
    $kept = mirio_times_load($keepDir);
    check(count($kept['times']['ribbon']) === MIRIO_TIMES_KEEP && $result['body']['rank'] === null, 'only the fastest hundred are retained and an unplaced run has null rank');
    check(count($result['body']['top']) === MIRIO_TIMES_SHOW && $result['body']['top'][0]['timeMs'] === 10000, 'public top lists have ten real entries at most');
    check($kept['times']['adventure'] === [] && $kept['times']['sky'] === [] && $kept['times']['kart'] === [], 'a full leaderboard does not populate other courses');
    mirio_times_submit($dir, time_run($dir, $now, 'ribbon'), 'legacy-check', $now);
    check(file_get_contents($dir . '/scores.json') === $legacy, 'legacy score bytes are unchanged by time submissions');
    check(!file_exists($dir . '/scores.lock'), 'time submissions never take the legacy score lock');

    if (function_exists('pcntl_fork')) {
        $atomicDir = $dir . '/atomic';
        $sameRun = time_run($atomicDir, $now);
        $children = [];
        for ($i = 0; $i < 4; $i++) {
            $pid = pcntl_fork();
            if ($pid === -1) throw new RuntimeException('Cannot fork replay check');
            if ($pid === 0) {
                $result = mirio_times_submit($atomicDir, $sameRun, 'atomic-client', $now);
                file_put_contents($atomicDir . '/result-' . $i, (string) $result['status']);
                exit(0);
            }
            $children[] = $pid;
        }
        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
            check(pcntl_wifexited($status) && pcntl_wexitstatus($status) === 0, 'concurrent submission worker completed');
        }
        $statuses = array_map(fn ($path) => (int) file_get_contents($path), glob($atomicDir . '/result-*'));
        sort($statuses);
        check($statuses === [200, 409, 409, 409] && count(mirio_times_load($atomicDir)['times']['adventure']) === 1, 'atomic locking accepts exactly one concurrent copy of a token');
    }

    foreach (['{broken', '{}', '{"times":[],"used":[],"recent":[],"nextId":1}'] as $broken) {
        file_put_contents($dir . '/times.json', $broken);
        $threw = false;
        try { mirio_times_submit($dir, time_run($dir, $now), 'damage-check', $now); }
        catch (RuntimeException $e) { $threw = true; }
        check($threw && file_get_contents($dir . '/times.json') === $broken, 'damaged or incomplete time data is preserved instead of silently overwritten');
    }
} finally {
    remove_test_dir($dir);
}
echo "all $checks Mirio time checks passed\n";
