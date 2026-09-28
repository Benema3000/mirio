// Biplane checks through the real keyboard, gamepad and touch input paths.
// Run with the local PHP server; PLAYWRIGHT, BASE_URL and SHOTS match mirio-e2e.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const results = [];
const snap = page => page.evaluate(() => window.__mirio.snapshot());
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, {timeout, polling: 75});
const gameTime = async (page, delta) => { const s = await snap(page); await until(page, time => window.__mirio.snapshot().time >= time, s.time + delta); };
async function check(name, fn) {
  try { await fn(); results.push(true); console.log(`ok   ${name}`); }
  catch (e) { results.push(false); console.error(`FAIL ${name}\n${e.message}`); }
}
async function shot(page, name) {
  if (!process.env.SHOTS) return;
  await mkdir(process.env.SHOTS, {recursive: true});
  await page.screenshot({path: `${process.env.SHOTS}/${name}.png`});
}
async function open(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__testPad = {connected: false, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 16}, () => ({pressed: false, value: 0}))};
    Object.defineProperty(navigator, 'getGamepads', {value: () => [window.__testPad], configurable: true});
  });
  await page.goto(`${BASE}?test&menu`, {waitUntil: 'domcontentloaded', timeout: 120000});
  await until(page, () => window.__mirio && !document.getElementById('start').disabled, null, 120000);
  return {context, page, errors};
}
try {
  const {context, page, errors} = await open({viewport: {width: 1280, height: 800}});
  await page.click('#start');
  await until(page, () => window.__mirio.snapshot().state === 'play');
  const home = await page.evaluate(() => window.__mirio.layout().biplane);
  const originalBitsTotal = (await snap(page)).bitsTotal;
  await check('the original toy plane is ready beside the start, with contextual boarding', async () => {
    assert.ok(await page.isVisible('#ride-action'));
    assert.equal((await snap(page)).biplane.altitude, 0);
    await shot(page, 'plane-parked');
  });
  await check('F boards Mirio and shows flight controls without altering health or gem totals', async () => {
    const before = await snap(page);
    await page.keyboard.press('KeyF');
    await until(page, () => window.__mirio.snapshot().biplane.mounted);
    const after = await snap(page);
    assert.equal(after.player.state, 'biplane');
    assert.equal(after.hearts, before.hearts);
    assert.equal(after.bitsTotal, before.bitsTotal);
    assert.ok(await page.isVisible('#plane-hud'));
    await gameTime(page, .4);
    await shot(page, 'plane-boarded');
  });
  await check('held climb reaches but never crosses the low ceiling; release settles to hover', async () => {
    await page.keyboard.down('Space');
    await until(page, () => window.__mirio.snapshot().biplane.altitude > 4.45);
    await gameTime(page, .6);
    const s = await snap(page);
    assert.ok(s.biplane.altitude <= home.ceiling + 1e-6);
    assert.equal(s.player.planet, home.planet);
    await shot(page, 'plane-ceiling');
    await page.keyboard.up('Space');
    await until(page, () => window.__mirio.snapshot().biplane.altitude < 1);
  });
  await check('F lands gently and leaves a reusable aircraft on dry ground', async () => {
    await page.keyboard.press('KeyF');
    await until(page, () => !window.__mirio.snapshot().biplane.mounted);
    const s = await snap(page);
    assert.equal(s.biplane.altitude, 0);
    assert.equal(s.player.state, 'play');
    assert.equal(s.hearts, 3);
    assert.equal(s.splashes, 0);
    await until(page, () => window.__mirio.snapshot().player.onGround);
    assert.ok(await page.isVisible('#ride-action'));
    await shot(page, 'plane-landed');
  });
  await check('steering flies along the curved meadow and Shift provides a limited burst', async () => {
    await page.keyboard.press('KeyF');
    await until(page, () => window.__mirio.snapshot().biplane.mounted);
    // Steer down an open meridian towards the lake, away from the main path.
    await page.evaluate(dir => {
      const f = window.__mirio.snapshot().biplane;
      window.__mirio.aim(dir.map((n, i) => n * 26 - f.pos[i]));
    }, [Math.cos(Math.PI / 4) * Math.cos(-100 * Math.PI / 180), Math.sin(Math.PI / 4), Math.cos(Math.PI / 4) * Math.sin(-100 * Math.PI / 180)]);
    const before = (await snap(page)).biplane.distance;
    await page.keyboard.down('KeyW');
    await until(page, d => window.__mirio.snapshot().biplane.distance > d + 2, before);
    await page.keyboard.press('ShiftLeft');
    await until(page, () => window.__mirio.snapshot().biplane.boost > 0);
    assert.ok((await snap(page)).biplane.cooldown > 0);
    await shot(page, 'plane-boost');
    await page.keyboard.up('KeyW');
    await gameTime(page, 1.3);
    assert.equal((await snap(page)).biplane.boost, 0);
  });
  await check('pause freezes the plane and clears held flight controls on resume', async () => {
    await page.keyboard.down('Space');
    await page.keyboard.press('Escape');
    await until(page, () => window.__mirio.snapshot().paused);
    const before = await snap(page);
    await page.waitForTimeout(350);
    assert.deepEqual((await snap(page)).biplane, before.biplane);
    await page.click('#resume');
    await gameTime(page, .6);
    await page.keyboard.up('Space');
    assert.ok((await snap(page)).biplane.altitude < 1.3);
  });
  await check('the plane skims the lake and refuses unsafe dismounting', async () => {
    await page.keyboard.down('KeyW');
    await until(page, () => {
      const f = window.__mirio.snapshot().biplane;
      const latitude = Math.asin(f.up[1]) * 180 / Math.PI;
      return latitude < 52 && latitude > 39;
    });
    await page.keyboard.up('KeyW');
    await gameTime(page, .8);
    await page.keyboard.press('KeyF');
    await gameTime(page, .1);
    assert.ok((await snap(page)).biplane.mounted);
    assert.equal((await snap(page)).biplane.landing, false);
    assert.match(await page.textContent('#hint'), /freie Wiese/);
    await page.keyboard.down('KeyC');
    await gameTime(page, .8);
    await page.keyboard.up('KeyC');
    const s = await snap(page);
    assert.ok(s.biplane.altitude >= .65 - 1e-6);
    assert.equal(s.splashes, 0);
    assert.equal(s.hearts, 3);
    await shot(page, 'plane-water');
  });
  await check('checkpoint rescue dismounts safely and recalls the aircraft', async () => {
    await page.click('#pause-button');
    await until(page, () => window.__mirio.snapshot().paused);
    assert.ok(await page.isVisible('#rescue'));
    await page.click('#rescue');
    await until(page, () => !window.__mirio.snapshot().paused);
    const s = await snap(page);
    assert.equal(s.biplane.mounted, false);
    assert.equal(s.biplane.altitude, 0);
    assert.equal(s.player.state, 'play');
    assert.ok(Math.hypot(...s.biplane.up.map((n, i) => n - home.dir[i])) < 1e-8);
    assert.ok(s.biplane.distance > 5, 'rescue keeps the run’s flight progress');
  });
  await check('controller Y boards once; B descends without leaving a queued ground pound', async () => {
    const pad = (button, pressed) => page.evaluate(([button, pressed]) => {
      window.__testPad.connected = true;
      window.__testPad.buttons[button] = {pressed, value: Number(pressed)};
    }, [button, pressed]);
    await until(page, () => window.__mirio.snapshot().player.onGround);
    await pad(3, true);
    await until(page, () => window.__mirio.snapshot().biplane.mounted);
    await gameTime(page, .3);
    assert.equal((await snap(page)).biplane.landing, false);
    await pad(3, false);
    await pad(0, true);
    await until(page, () => window.__mirio.snapshot().biplane.altitude > 1.5);
    await pad(0, false);
    await pad(1, true);
    await until(page, () => window.__mirio.snapshot().biplane.altitude < .1);
    await pad(1, false);
    await pad(3, true);
    await until(page, () => !window.__mirio.snapshot().biplane.mounted);
    await pad(3, false);
    assert.equal((await snap(page)).pounds, 0);
    await page.evaluate(() => { window.__testPad.connected = false; });
  });
  await check('replay resets the ride without changing the score rules or leaving errors', async () => {
    const s = await page.evaluate(() => { document.getElementById('again').click(); return window.__mirio.snapshot(); });
    assert.equal(s.biplane.mounted, false);
    assert.equal(s.biplane.distance, 0);
    assert.equal(s.biplane.rides, 0);
    assert.equal(s.bitsTotal, originalBitsTotal);
    assert.deepEqual(errors, []);
  });
  await check('low flight can sweep up ordinary meadow gems', async () => {
    await until(page, () => window.__mirio.snapshot().player.onGround);
    const before = (await snap(page)).bits;
    await page.keyboard.press('KeyF');
    await until(page, () => window.__mirio.snapshot().biplane.mounted && window.__mirio.snapshot().biplane.altitude > .55);
    await page.evaluate(() => {
      const f = window.__mirio.snapshot().biplane;
      const lat = 86.5 * Math.PI / 180;
      window.__mirio.aim([Math.cos(lat) * 26 - f.pos[0], Math.sin(lat) * 26 - f.pos[1], -f.pos[2]]);
    });
    await page.keyboard.down('KeyW');
    try { await until(page, before => window.__mirio.snapshot().bits > before, before, 20000); }
    finally { await page.keyboard.up('KeyW'); }
    assert.ok((await snap(page)).biplane.altitude < .8, 'gems are reachable without climbing');
    await shot(page, 'plane-meadow-gem');
  });
  await context.close();

  const mobile = await open({viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
  await mobile.page.tap('#start');
  await check('touch boarding and landing work in landscape and portrait without overlap', async () => {
    await until(mobile.page, () => window.__mirio.snapshot().state === 'play');
    await mobile.page.tap('#ride-action');
    await until(mobile.page, () => window.__mirio.snapshot().biplane.mounted);
    assert.equal(await mobile.page.getAttribute('#btn-pound', 'aria-label'), 'Sinken');
    assert.equal(await mobile.page.getAttribute('#btn-spin', 'aria-label'), 'Propeller-Turbo');
    await shot(mobile.page, 'plane-phone-landscape');
    await mobile.page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
    await mobile.page.setViewportSize({width: 390, height: 844});
    const ride = await mobile.page.locator('#ride-action').boundingBox();
    const spin = await mobile.page.locator('#btn-spin').boundingBox();
    assert.ok(ride.x >= 0 && ride.y + ride.height <= 844);
    assert.ok(ride.y >= spin.y + spin.height || ride.x + ride.width <= spin.x, 'ride action overlaps the spin button');
    assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await shot(mobile.page, 'plane-phone-portrait');
    await mobile.page.tap('#ride-action');
    await until(mobile.page, () => !window.__mirio.snapshot().biplane.mounted);
    assert.equal(await mobile.page.getAttribute('#btn-pound', 'aria-label'), 'Stampfen');
  });
  await check('touch flight logs no browser or shader errors', async () => assert.deepEqual(mobile.errors, []));
  await mobile.context.close();
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} biplane checks passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
