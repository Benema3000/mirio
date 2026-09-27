// Standalone kart entry through its real finish, time board, replay and menus.
// Serve locally with PHP. PLAYWRIGHT, BASE_URL and SHOTS follow mirio-e2e.mjs.
// Public-form submissions are deliberately restricted to a loopback server.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const origin = new URL(BASE);
assert.ok(['127.0.0.1', 'localhost', '[::1]', '::1'].includes(origin.hostname),
  'Kart score regression may submit only to a local loopback server.');
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const results = [];
const snap = page => page.evaluate(() => window.__mirio.snapshot());
const until = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, {timeout, polling: 75});
async function gameTime(page, seconds) {
  const before = await snap(page);
  await until(page, t => window.__mirio.snapshot().time >= t, before.time + seconds, 180000);
}
async function check(name, fn) {
  try { await fn(); results.push(true); console.log(`ok   ${name}`); }
  catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.message}`); }
}
async function shot(page, name) {
  if (!process.env.SHOTS) return;
  await mkdir(process.env.SHOTS, {recursive: true});
  await page.screenshot({path: `${process.env.SHOTS}/${name}.png`});
}
function readDisplayTime(text) {
  const match = text.trim().match(/^(\d+):(\d{2})\.(\d{2})$/);
  assert.ok(match, `unexpected result time: ${text}`);
  return Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(match[3]) * 10;
}
async function choose(page, level) {
  await page.click(`[data-level="${level}"]`);
  await page.click('#start');
}
async function pauseMenu(page) {
  await page.click('#pause-button');
  await page.click('#pause-menu');
  await until(page, () => window.__mirio.snapshot().state === 'title');
}

try {
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  const page = await context.newPage(), errors = [], posts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    const url = new URL(request.url());
    if (url.origin !== origin.origin) errors.push(`unexpected external POST: ${url.origin}`);
    if (url.pathname.endsWith('/api/times.php')) posts.push(request.postDataJSON());
  });
  await page.goto(`${BASE}?test`, {waitUntil: 'domcontentloaded', timeout: 120000});
  await until(page, () => window.__mirio && !document.getElementById('start').disabled);
  let firstBest = null;

  await check('the kart starts directly from its card with its own gem denominator and fresh timer', async () => {
    await choose(page, 'kart');
    const start = await snap(page);
    assert.equal(start.selectedLevel, 'kart');
    assert.equal(start.state, 'race');
    assert.equal(start.chapterRun, null);
    assert.equal(start.time, 0);
    assert.equal(start.bits, 0);
    assert.match(await page.textContent('#bits'), /^0\s*\/\s*77$/);
    assert.equal(await page.evaluate(() => localStorage.getItem('mirio-time-best-v1:kart')), null);
    await until(page, () => window.__mirio.snapshot().race.state === 'race');
  });

  await check('normal gas drives at least twelve race seconds before the finish shortcut', async () => {
    const before = await snap(page);
    await page.keyboard.down('ArrowUp');
    await until(page, () => window.__mirio.snapshot().race.speed > 8);
    await gameTime(page, 12);
    const after = await snap(page);
    assert.equal(after.state, 'race');
    assert.ok(after.time >= before.time + 12);
    assert.ok(after.race.progress > before.race.progress + .03, `progress ${after.race.progress}`);
    assert.ok(Number.isFinite(after.race.speed));
    assert.equal(await page.evaluate(() => localStorage.getItem('mirio-time-best-v1:kart')), null,
      'a best must not be stored before finishing');
    await shot(page, 'kart-entry-driving');
  });

  await check('pause freezes the race clock and track position, then resume accepts fresh gas', async () => {
    await page.click('#pause-button');
    await until(page, () => window.__mirio.snapshot().paused);
    const paused = await snap(page);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(400);
    const still = await snap(page);
    assert.equal(still.time, paused.time);
    assert.equal(still.race.progress, paused.race.progress);
    assert.equal(still.race.speed, paused.race.speed);
    await page.click('#resume');
    await page.keyboard.down('ArrowUp');
    await gameTime(page, .4);
    assert.equal((await snap(page)).paused, false);
    assert.ok((await snap(page)).race.progress > paused.race.progress);
  });

  await check('driving the last section finishes the standalone kart and stores the exact race time', async () => {
    await page.evaluate(() => window.__mirio.raceSkip(.98));
    // Only the long middle route is skipped; normal gas crosses the line.
    await until(page, () => window.__mirio.snapshot().state === 'win');
    await page.keyboard.up('ArrowUp');
    const result = await snap(page);
    assert.equal(result.selectedLevel, 'kart');
    assert.equal(result.race.state, 'finished');
    assert.ok(result.time >= 12);
    assert.ok(result.winVisible);
    assert.match(await page.textContent('#win-eyebrow'), /STERNENRENNEN/);
    const displayed = readDisplayTime(await page.textContent('#win-time'));
    firstBest = await page.evaluate(() => Number(localStorage.getItem('mirio-time-best-v1:kart')));
    assert.ok(Number.isSafeInteger(firstBest) && firstBest >= 12000);
    assert.equal(firstBest, Math.round(result.time * 1000), 'PB and interpolated race clock differ');
    assert.ok(Math.abs(result.time * 1000 - displayed) < 10.6, 'displayed hundredths differ from final clock');
    assert.ok(firstBest >= displayed && firstBest - displayed < 10);
    for (const level of ['adventure', 'sky', 'ribbon']) assert.equal(
      await page.evaluate(id => localStorage.getItem(`mirio-time-best-v1:${id}`), level), null);
    const stats = await page.textContent('#win-stats');
    assert.match(stats, /Kartrennen:/); assert.match(stats, /von 77/);
    assert.doesNotMatch(stats, /Wasser|Dreifachsprung|153/);
    assert.match(await page.textContent('#win-extra'), new RegExp(`${77 - result.bits} Glitzersteine`));
    await page.waitForTimeout(250);
    assert.equal((await snap(page)).time, result.time, 'result celebration changes the finish time');
    await shot(page, 'kart-entry-result');
  });

  await check('the local public form submits kart with the same integer milliseconds as its personal best', async () => {
    await until(page, () => !document.getElementById('score-form').hidden);
    const nickname = `Kart${Date.now().toString(36).slice(-7)}`;
    await page.fill('#score-name', nickname);
    const responsePending = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === origin.origin && url.pathname.endsWith('/api/times.php') && response.request().method() === 'POST';
    }, {timeout: 30000});
    await page.click('#score-send');
    const response = await responsePending, body = await response.json();
    assert.ok(response.ok() && body.ok, `local time submission failed: ${JSON.stringify(body)}`);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].level, 'kart');
    assert.equal(posts[0].name, nickname);
    assert.ok(Number.isSafeInteger(posts[0].timeMs));
    assert.equal(posts[0].timeMs, firstBest);
    assert.equal(posts[0].points, undefined); assert.equal(posts[0].bits, undefined);
    assert.equal(body.level, 'kart'); assert.equal(body.timeMs, firstBest);
    await until(page, () => document.getElementById('score-form').hidden);
    assert.match(await page.textContent('#score-status'), /Platz|eingetragen/);
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('mirio-time-best-v1:kart'))), firstBest);
  });

  await check('Nochmal resets the kart and its clock, and a second normal finish can return through the win menu', async () => {
    await page.click('#again');
    const retry = await snap(page);
    assert.equal(retry.selectedLevel, 'kart'); assert.equal(retry.state, 'race');
    assert.equal(retry.time, 0); assert.equal(retry.bits, 0);
    assert.ok(retry.race.progress < .01);
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('mirio-time-best-v1:kart'))), firstBest);
    await until(page, () => window.__mirio.snapshot().race.state === 'race');
    await page.keyboard.down('ArrowUp');
    await gameTime(page, .3);
    await page.evaluate(() => window.__mirio.raceSkip(.995));
    await until(page, () => window.__mirio.snapshot().state === 'win');
    await page.keyboard.up('ArrowUp');
    assert.ok((await snap(page)).time < 8, 'retry retained time from the previous race');
    // This abbreviated retry stays private; only the first >=12 s run was submitted.
    assert.equal(posts.length, 1);
    await page.click('#win-menu');
    await until(page, () => window.__mirio.snapshot().state === 'title');
    assert.equal(await page.getAttribute('[data-level="kart"]', 'aria-pressed'), 'true');
    assert.match(await page.textContent('[data-best="kart"]'), /\d+:\d{2}\.\d{2}/);
    assert.equal(await page.isVisible('#win'), false);
  });

  await check('pause-menu leaves an unfinished kart and switching to the garden restores an upright camera', async () => {
    await page.click('#start');
    await until(page, () => window.__mirio.snapshot().race.state === 'race');
    await page.evaluate(() => window.__mirio.raceSkip(.3));
    await gameTime(page, .2);
    await pauseMenu(page);
    assert.equal((await snap(page)).paused, false);
    assert.ok(await page.isVisible('#title'));
    await choose(page, 'ribbon');
    await until(page, () => window.__mirio.snapshot().state === 'chapter');
    assert.deepEqual((await snap(page)).cameraUp, [0, 1, 0]);
    await until(page, () => window.__mirio.snapshot().chapterRun.countdown === 0);
    const before = (await snap(page)).chapterRun;
    await page.keyboard.down('KeyD'); await gameTime(page, .4); await page.keyboard.up('KeyD');
    const garden = await snap(page);
    assert.ok(garden.chapterRun.x > before.x + .5);
    assert.deepEqual(garden.cameraUp, [0, 1, 0]);
    assert.ok(garden.rendering.calls > 0);
    await shot(page, 'kart-entry-garden-switch');
    await pauseMenu(page);
  });

  await check('the original adventure remains selectable after the standalone race, without browser errors', async () => {
    await choose(page, 'adventure');
    const adventure = await snap(page);
    assert.equal(adventure.state, 'play'); assert.equal(adventure.chapterRun, null);
    assert.match(await page.textContent('#bits'), /^0\s*\/\s*153$/);
    assert.ok(await page.isVisible('#ride-action'));
    await pauseMenu(page);
    assert.equal(posts.length, 1, 'a level transition unexpectedly submitted a public time');
    assert.deepEqual(errors, []);
  });
  await context.close();
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} standalone kart checks passed`);
if (results.some(result => !result)) process.exitCode = 1;
