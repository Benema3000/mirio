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
async function aboveEnemy(page, id, height) {
  await page.evaluate(([id, height]) => {
    const state = window.__mirio.snapshot();
    const enemy = state.enemies.creatures.find(e => e.id === id);
    const planet = window.__mirio.layout().planets.find(p => p.id === enemy.planet);
    const position = enemy.pos.map((n, i) => n + enemy.up[i] * height - planet.center[i]);
    const radius = Math.hypot(...position);
    window.__mirio.teleport(enemy.planet, position.map(n => n / radius), radius - planet.radius);
  }, [id, height]);
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

  await check('the world contains birds, squirrels, seven original enemies and three springflowers', async () => {
    const s = await snapshot(page);
    console.log(`     renderer: ${s.rendering.calls} calls, ${s.rendering.triangles} triangles, quality ${s.rendering.quality}`);
    assert.ok(s.wildlife.counts.bird >= 4);
    assert.ok(s.wildlife.counts.squirrel >= 3);
    assert.equal(layout.enemies.length, 7);
    assert.equal(layout.garden.length, 3);
    assert.ok(await page.isVisible('#hearts'));
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
  await check('close encounters discover both harmless species and animate a reaction', async () => {
    const hearts = (await snapshot(page)).hearts;
    for (const kind of ['bird', 'squirrel']) {
      const animal = layout.wildlife.find(a => a.kind === kind && a.height < 3) ?? layout.wildlife.find(a => a.kind === kind);
      await teleport(page, animal.planet, animal.dir, .1);
      await until(page, kind => window.__mirio.snapshot().wildlife.discovered.includes(kind), kind);
      await until(page, id => ['flee', 'scurry', 'return', 'circle'].includes(window.__mirio.snapshot().wildlife.animals.find(a => a.id === id).state), animal.id);
      assert.ok(await page.locator(`#friend-${kind}`).evaluate(el => el.classList.contains('found')));
      await shot(page, `living-${kind}`);
    }
    assert.equal((await snapshot(page)).hearts, hearts);
  });
  await check('stomping a creature defeats it once and bounces Mirio', async () => {
    const enemy = layout.enemies[0];
    await aboveEnemy(page, enemy.id, 3.2);
    await until(page, id => window.__mirio.snapshot().enemies.creatures.find(e => e.id === id).mode === 'defeated', enemy.id);
    assert.equal((await snapshot(page)).creatures, 1);
    await until(page, () => window.__mirio.snapshot().player.height > 2.5);
    await shot(page, 'living-stomp');
  });
  await check('contact costs one heart, invulnerability prevents repeated hits, and spin can stun then defeat', async () => {
    const enemy = layout.enemies[1];
    await gameTime(page, .7);
    await aboveEnemy(page, enemy.id, .15);
    await until(page, () => window.__mirio.snapshot().hearts === 2);
    await gameTime(page, .5);
    assert.equal((await snapshot(page)).hearts, 2);
    const next = layout.enemies[2];
    await aboveEnemy(page, next.id, .15);
    await page.keyboard.press('ShiftLeft');
    await until(page, id => window.__mirio.snapshot().enemies.creatures.find(e => e.id === id).mode === 'stunned', next.id);
    await shot(page, 'living-stunned');
    await gameTime(page, .65);
    await aboveEnemy(page, next.id, .15);
    await page.keyboard.press('ShiftLeft');
    await until(page, id => window.__mirio.snapshot().enemies.creatures.find(e => e.id === id).mode === 'defeated', next.id);
    assert.equal((await snapshot(page)).creatures, 2);
    assert.equal((await snapshot(page)).hearts, 3, 'a defeated creature restores one heart');
  });
  await check('moon pebbles wake on approach and can be stomped in lunar gravity', async () => {
    const enemy = layout.enemies.find(e => e.kind === 'pebble');
    await page.evaluate(enemy => {
      const side = Math.abs(enemy.dir[1]) < .9 ? [enemy.dir[2], 0, -enemy.dir[0]] : [1, 0, 0];
      const length = Math.hypot(...side);
      const dir = enemy.dir.map((n, i) => n * Math.cos(.27) + side[i] / length * Math.sin(.27));
      window.__mirio.teleport(enemy.planet, dir, .1);
      window.__mirio.aim(enemy.dir.map((n, i) => n - dir[i]));
    }, enemy);
    await until(page, id => ['windup', 'charge'].includes(window.__mirio.snapshot().enemies.creatures.find(e => e.id === id).mode), enemy.id);
    await shot(page, 'living-moon-pebble');
    await aboveEnemy(page, enemy.id, 3.2);
    await until(page, id => window.__mirio.snapshot().enemies.creatures.find(e => e.id === id).mode === 'defeated', enemy.id);
    assert.equal((await snapshot(page)).creatures, 3);
  });
  await check('pause freezes creature rules, animal poses and spring effects together', async () => {
    await teleport(page, 'welt', [0, 1, 0], 0);
    await page.click('#pause-button');
    await until(page, () => window.__mirio.snapshot().paused);
    const before = await snapshot(page);
    await page.waitForTimeout(500);
    const after = await snapshot(page);
    assert.deepEqual(after.enemies, before.enemies);
    assert.deepEqual(after.wildlife, before.wildlife);
    assert.deepEqual(after.garden, before.garden);
    await shot(page, 'living-field-guide');
    await page.click('#resume');
  });
  await check('replay resets enemies, discoveries and flowers without changing the gem total', async () => {
    const total = (await snapshot(page)).bitsTotal;
    const s = await page.evaluate(() => { document.getElementById('again').click(); return window.__mirio.snapshot(); });
    assert.equal(s.enemies.defeated, 0);
    assert.equal(s.creatures, 0);
    assert.equal(s.garden.used.length, 0);
    assert.deepEqual(s.wildlife.discovered, []);
    assert.equal(s.bitsTotal, total);
    assert.ok(s.enemies.creatures.every(e => e.mode === 'patrol'));
  });
  await check('living world has no browser or shader errors', async () => assert.deepEqual(errors, []));
  await context.close();
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} living-world checks passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
