// Exercise both public protocol generations against isolated disk storage.
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {COURSE_VERSION, COURSE} from '../js/course-version.js';

const HTTP_OK = 200, HTTP_BAD_REQUEST = 400;
const TOKEN_AGE_WAIT_MS = 6000, POSTAL_RUN_MS = 20000, SHORT_RUN_MS = 10000;
const directory = await mkdtemp(join(tmpdir(), 'mirio-course-test-'));
const legacy = {times: {adventure: [], sky: [{id: 1, name: 'Altflug', timeMs: 21000, date: '2026-01-01'}], ribbon: [], kart: []}, used: [], recent: [], nextId: 2};
const legacyText = JSON.stringify(legacy);
await writeFile(join(directory, 'times.json'), legacyText);
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const server = spawn(process.env.PHP ?? 'php', ['-n', '-S', `127.0.0.1:${port}`], {
  cwd: new URL('../', import.meta.url), env: {...process.env, MIRIO_TIMES_DIR: directory}, stdio: 'ignore',
});
const base = `http://127.0.0.1:${port}/api/times.php`;
const current = `${base}?course=${COURSE_VERSION}`;
const post = (url, token) => fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({level: 'sky', token, name: 'Wolkenkind', timeMs: POSTAL_RUN_MS})});
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await fetch(base); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const oldBoard = await (await fetch(`${base}?level=sky`)).json();
  const newBoard = await (await fetch(`${current}&level=sky`)).json();
  assert.equal(oldBoard.top[0].name, 'Altflug');
  assert.deepEqual(newBoard.top, []);
  assert.equal(newBoard.course, COURSE_VERSION, 'clients must be able to reject an outdated API');
  assert.equal((await post(current, oldBoard.token)).status, HTTP_BAD_REQUEST);
  assert.equal((await post(base, newBoard.token)).status, HTTP_BAD_REQUEST);
  assert.equal((await fetch(`${base}?course=../legacy&level=sky`)).status, HTTP_BAD_REQUEST);

  // The honest elapsed duration must fit the server's token-age allowance.
  await new Promise(resolve => setTimeout(resolve, TOKEN_AGE_WAIT_MS));
  const response = await post(current, newBoard.token);
  assert.equal(response.status, HTTP_OK);
  const result = await response.json();
  assert.equal(result.top[0].name, 'Wolkenkind');
  assert.equal(result.top[0].timeMs, POSTAL_RUN_MS);
  assert.equal(await readFile(join(directory, 'times.json'), 'utf8'), legacyText);
  assert.ok(JSON.parse(await readFile(join(directory, 'courses', COURSE_VERSION, 'times.json'), 'utf8')).times.sky.length);
  const archivePath = join(directory, 'courses', COURSE_VERSION, 'times.json');
  const archive = await readFile(archivePath, 'utf8');
  for (const [course, level] of [[COURSE.DISCOVERY, 'adventure'], [COURSE.CLASSIC, 'kart'], [COURSE.BRANCHES, 'kart'],
    [COURSE.PINBALL, 'marble'], [COURSE.JOURNEY, 'sky'], [COURSE.JOURNEY, 'ribbon']]) {
    const url = `${base}?course=${course}`;
    const response = await fetch(`${url}&level=${level}`);
    assert.equal(response.status, HTTP_OK, `${course} must accept ${level}`);
    const fresh = await response.json();
    const old = await (await fetch(`${current}&level=${level}`)).json();
    assert.equal(fresh.course, course);
    assert.deepEqual(fresh.top, []);
    const timeMs = level === 'sky' ? POSTAL_RUN_MS : SHORT_RUN_MS;
    const submit = token => fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({level, token, name: 'Sternenkind', timeMs})});
    assert.equal((await submit(old.token)).status, HTTP_BAD_REQUEST, `${course} must reject old course tokens`);
    if (level !== 'adventure') {
      if (level === 'sky') await new Promise(resolve => setTimeout(resolve, TOKEN_AGE_WAIT_MS));
      const result = await submit(fresh.token);
      assert.equal(result.status, HTTP_OK);
      assert.equal((await result.json()).top[0].timeMs, timeMs);
    }
  }
  assert.equal(await readFile(archivePath, 'utf8'), archive, 'v2 rows and used tokens stay byte-for-byte intact');
  assert.equal(await readFile(join(directory, 'times.json'), 'utf8'), legacyText);
  console.log('PASS course records, v2 archive, five revision scopes, token isolation, submission');
} finally {
  server.kill();
  await new Promise(resolve => server.once('exit', resolve));
  await rm(directory, {recursive: true, force: true});
}
