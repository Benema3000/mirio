// Real-player checks for the living world. Use the PHP server and the same
// PLAYWRIGHT / BASE_URL / SHOTS settings as the other browser suites.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const results = [];
const snapshot = page => page.evaluate(() => window.__mirio.snapshot());
const until = (page, fn, arg, timeout = 45000) => page.waitForFunction(fn, arg, {timeout, polling: 100});
const gameTime = async (page, seconds) => { const s = await snapshot(page); await until(page, t => window.__mirio.snapshot().time >= t, s.time + seconds); };
const teleport = (page, planet, dir, height = .1) => page.evaluate(args => window.__mirio.teleport(...args), [planet, dir, height]);
async function check(name, fn) {
  try { await fn(); results.push(true); console.log(`ok   ${name}`); }
  catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.message}`); }
}
async function shot(page, name) {
  if (!process.env.SHOTS) return;
  await mkdir(process.env.SHOTS, {recursive: true});
  await page.screenshot({path: `${process.env.SHOTS}/${name}.png`});
}
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE}?test&menu`, {waitUntil: 'domcontentloaded', timeout: 120000});
  await until(page, () => window.__mirio && !document.getElementById('start').disabled, null, 120000);
  await page.click('#start');
  await until(page, () => window.__mirio.snapshot().state === 'play');
  const layout = await page.evaluate(() => window.__mirio.layout());

  await check('the meadow has a few birds and three springflowers, no crowd and no hearts outside the boss', async () => {
    const s = await snapshot(page);
    console.log(`     renderer: ${s.rendering.calls} calls, ${s.rendering.triangles} triangles, quality ${s.rendering.quality}`);
    assert.ok(s.wildlife.counts.bird >= 3 && s.wildlife.counts.bird <= 5);
    assert.equal(s.wildlife.counts.squirrel, 0);
    assert.equal(layout.garden.length, 3);
    assert.equal(await page.isVisible('#hearts'), false);
    await shot(page, 'living-meadow');
  });
  await check('a springflower actually launches Mirio, and a new run clears its stamp', async () => {
    const flower = layout.garden[0];
    await teleport(page, flower.planet, flower.dir, .2);
    await until(page, () => window.__mirio.snapshot().garden.used.length > 0);
    await until(page, () => window.__mirio.snapshot().player.height > 3);
    assert.equal((await snapshot(page)).player.onGround, false);
    await shot(page, 'living-spring');
    await teleport(page, 'welt', [0, 1, 0], 0);
  });
  await check('ground-pounding a springflower gives a higher automatic bounce', async () => {
    const flower = layout.garden[0];
    await gameTime(page, .7);
    await teleport(page, flower.planet, flower.dir, 5);
    await page.keyboard.press('KeyC');
    await until(page, () => window.__mirio.snapshot().player.height > 7.5);
    await shot(page, 'living-super-spring');
    await teleport(page, 'welt', [0, 1, 0], 0);
  });
  await check('a close encounter startles a bird into the air, and costs nothing', async () => {
    const hearts = (await snapshot(page)).hearts;
    const bird = layout.wildlife.find(a => a.kind === 'bird' && a.height < 3) ?? layout.wildlife.find(a => a.kind === 'bird');
    await teleport(page, bird.planet, bird.dir, .1);
    await until(page, () => window.__mirio.snapshot().wildlife.discovered.includes('bird'));
    await until(page, id => ['flee', 'return', 'circle'].includes(window.__mirio.snapshot().wildlife.animals.find(a => a.id === id).state), bird.id);
    await shot(page, 'living-bird');
    assert.equal((await snapshot(page)).hearts, hearts);
  });
  await check('pause freezes animal poses and spring effects together', async () => {
    await teleport(page, 'welt', [0, 1, 0], 0);
    await page.click('#pause-button');
    await until(page, () => window.__mirio.snapshot().paused);
    const before = await snapshot(page);
    await page.waitForTimeout(500);
    const after = await snapshot(page);
    assert.deepEqual(after.wildlife, before.wildlife);
    assert.deepEqual(after.garden, before.garden);
    await shot(page, 'living-field-guide');
    await page.click('#resume');
  });
  await check('replay resets discoveries and flowers without changing the gem total', async () => {
    const total = (await snapshot(page)).bitsTotal;
    const s = await page.evaluate(() => { document.getElementById('again').click(); return window.__mirio.snapshot(); });
    assert.equal(s.garden.used.length, 0);
    assert.deepEqual(s.wildlife.discovered, []);
    assert.equal(s.bitsTotal, total);
  });
  await check('living world has no browser or shader errors', async () => assert.deepEqual(errors, []));
  await context.close();
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} living-world checks passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
