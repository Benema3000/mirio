<?php
// Mirio high score rules (api/scores.inc).
// Run: php tests/mirio-scores.php
declare(strict_types=1);

require __DIR__ . '/../api/scores.inc';

function check(bool $ok, string $what): void
{
    if (!$ok) {
        throw new RuntimeException('FAIL: ' . $what);
    }
    echo "ok   $what\n";
}

$dir = sys_get_temp_dir() . '/mirio-scores-test-' . bin2hex(random_bytes(4));
$now = 1_800_000_000;
$client = '203.0.113.7';

/** A finished run whose token was fetched $age seconds ago. */
function run(string $dir, int $now, int $age, array $fields = []): array
{
    $token = mirio_scores_token(mirio_scores_secret($dir), $now - $age);
    return $fields + ['token' => $token, 'name' => 'Miro', 'bits' => 40, 'time' => 300.4, 'place' => 1];
}

try {
    check(mirio_scores_points(40, 300, 1) === 400 + 500 + 600, 'points: 10 per Glitzerstein, 500 for winning the race, a second less is a point more');
    check(mirio_scores_points(0, 1200, 2) === 200, 'points: second place 200, no time bonus after 15 minutes');

    check(mirio_scores_clean_name('  Miro   der  Grosse ') === 'Miro der Grosse', 'names: spaces trimmed and squeezed');
    check(mirio_scores_clean_name('Zoë-Jö_2.!') === 'Zoë-Jö_2.!', 'names: umlauts, digits and a few signs are fine');
    check(mirio_scores_clean_name('Barsch') === 'Barsch' && mirio_scores_clean_name('Klasse') === 'Klasse', 'names: harmless words that contain rude ones pass');
    foreach (['', ' ', '-Miro', str_repeat('a', 17), '<b>x</b>', 'Miro😀', "Mi\u{0000}ro", 'Ar5ch', 'fuck3r', 'Scheisse', 'Mr H1tler', 'SEX', 12] as $bad) {
        check(mirio_scores_clean_name($bad) === null, 'names: rejects ' . json_encode($bad, JSON_UNESCAPED_UNICODE));
    }

    $secret = mirio_scores_secret($dir);
    check(mirio_scores_secret($dir) === $secret && strlen($secret) === 64, 'the secret is made once and kept');
    $token = mirio_scores_token($secret, $now);
    check(mirio_scores_read_token($token, $secret, $now + 10)['t'] === $now, 'a token reads back');
    check(mirio_scores_read_token($token, str_repeat('0', 64), $now) === null, 'a token signed with another secret is refused');
    check(mirio_scores_read_token(substr($token, 0, -1) . 'x', $secret, $now) === null, 'a changed token is refused');
    check(mirio_scores_read_token($token, $secret, $now + MIRIO_SCORES_TOKEN_AGE + 1) === null, 'an old token is refused');

    $first = mirio_scores_submit($dir, run($dir, $now, 400), $client, $now);
    check($first['status'] === 200 && $first['body']['rank'] === 1 && $first['body']['points'] === 1500, 'a run lands on the list with its points');
    $input = run($dir, $now, 400, ['name' => 'Lea', 'bits' => 50]);
    check(mirio_scores_submit($dir, $input, $client, $now)['body']['rank'] === 1, 'a better run goes above');
    check(mirio_scores_submit($dir, $input, $client, $now)['status'] === 409, 'the same run cannot be sent twice');
    $slow = mirio_scores_submit($dir, run($dir, $now, 400, ['name' => 'Tim', 'bits' => 40]), $client, $now + 5);
    check($slow['body']['rank'] === 3, 'an equal score goes below the one that was there first');
    $top = $slow['body']['top'];
    check(array_column($top, 'name') === ['Lea', 'Miro', 'Tim'] && array_column($top, 'rank') === [1, 2, 3], 'the top list, best first');
    check(!array_key_exists('at', $top[0]) && $top[0]['date'] === gmdate('Y-m-d', $now), 'the top list shows the date, nothing else about the run');

    $claims = [
        'faster than the time since the token' => run($dir, $now, 100, ['time' => 200]),
        'too many Glitzersteine' => run($dir, $now, 400, ['bits' => MIRIO_SCORES_MAX_BITS + 1]),
        'bits as a string' => run($dir, $now, 400, ['bits' => '40']),
        'a third place' => run($dir, $now, 400, ['place' => 3]),
        'too short a run' => run($dir, $now, 400, ['time' => MIRIO_SCORES_MIN_TIME - 1]),
        'no token' => ['name' => 'Miro', 'bits' => 40, 'time' => 300, 'place' => 1],
        'a rude name' => run($dir, $now, 400, ['name' => 'Arschloch']),
    ];
    foreach ($claims as $what => $claim) {
        check(mirio_scores_submit($dir, $claim, $client, $now)['status'] === 400, "refuses $what");
    }
    check(mirio_scores_submit($dir, null, $client, $now)['status'] === 400, 'refuses a body that is not JSON');

    $sent = 3;
    while ($sent < MIRIO_SCORES_RATE) {
        mirio_scores_submit($dir, run($dir, $now, 400), $client, $now);
        $sent++;
    }
    check(mirio_scores_submit($dir, run($dir, $now, 400), $client, $now)['status'] === 429, 'the eleventh entry from one address in ten minutes waits');
    check(mirio_scores_submit($dir, run($dir, $now, 400), '198.51.100.1', $now)['status'] === 200, 'another address can still send');
    $later = $now + MIRIO_SCORES_RATE_WINDOW + 1;
    check(mirio_scores_submit($dir, run($dir, $later, 400), $client, $later)['status'] === 200, 'ten minutes later the first address can send again');
    check(!str_contains((string) file_get_contents("$dir/scores.json"), $client), 'addresses are not stored');

    for ($i = 0; $i < MIRIO_SCORES_KEEP; $i++) {
        $t = $later + 1000 + $i * 700;
        mirio_scores_submit($dir, run($dir, $t, 400, ['name' => "Kind $i", 'bits' => 100]), "10.0.0.$i", $t);
    }
    $data = mirio_scores_load($dir);
    check(count($data['scores']) === MIRIO_SCORES_KEEP && $data['scores'][0]['name'] === 'Kind 0', 'the list keeps the best 100');
    check(count($data['recent']) < 20, 'old rate-limit entries are dropped');

    file_put_contents("$dir/scores.json", '{broken');
    $threw = false;
    try {
        mirio_scores_submit($dir, run($dir, $now, 400), $client, $now);
    } catch (RuntimeException $e) {
        $threw = true;
    }
    check($threw && file_get_contents("$dir/scores.json") === '{broken', 'a damaged file is left alone, not started over');
} finally {
    foreach (glob("$dir/*") ?: [] as $f) {
        unlink($f);
    }
    @rmdir($dir);
}
echo "all Mirio score checks passed\n";
