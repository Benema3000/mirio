// Focused browser regressions for the polished adventure and its controls.
// Run against a local PHP server with the same PLAYWRIGHT / BASE_URL / SHOTS
// environment options as mirio-e2e.mjs. No score is submitted by this suite.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = [];
const snap = page => page.evaluate(() => window.__mirio.snapshot());
const until = (page, predicate, argument, timeout = 45000) => page.waitForFunction(predicate, argument, { timeout, polling: 100 });
const teleport = (page, planet, dir, height = 0) => page.evaluate(args => window.__mirio.teleport(...args), [planet, dir, height]);
const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = page => until(page, () => window.__mirio && !document.getElementById('start').disabled, null, 120000);
const gameTime = (page, delta) => snap(page).then(s => until(page, time => window.__mirio.snapshot().time >= time, s.time + delta));

async function check(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`ok   ${name}`);
  } catch (error) {
    results.push(false);
    console.error(`FAIL ${name}\n     ${error.message.split('\n')[0]}`);
  }
}

async function open(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  // Scene generation and software WebGL can delay lifecycle events when
  // the full gameplay suite runs alongside this one on the same machine.
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // The real browser input loop still polls the Gamepad API. Only its
  // physical device is replaced, so pause/resume exercises disabled input.
  await page.addInitScript(() => {
    window.__testPad = {
      connected: false, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__testPad] });
  });
  await page.goto(`${BASE}?test&menu`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  return { context, page, errors };
}

async function shot(page, name) {
  if (!process.env.SHOTS) return;
  await mkdir(process.env.SHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
}

async function fits(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = await page.locator(selector).boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} is outside ${viewport.width} × ${viewport.height}: ${JSON.stringify(box)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'the page scrolls sideways');
}

const browser = await chromium.launch({ args: GL_ARGS });
try {
  const { page, context, errors } = await open(browser, { viewport: { width: 1100, height: 740 } });
  await page.click('#start');
  await until(page, () => window.__mirio.snapshot().state === 'play');

  await check('pause freezes game time and releases a held movement key', async () => {
    const before = await snap(page);
    await page.keyboard.down('KeyW');
    await until(page, p => {
      const now = window.__mirio.snapshot().player.pos;
      return Math.hypot(...now.map((n, i) => n - p[i])) > 0.8;
    }, before.player.pos);
    await page.keyboard.press('Escape');
    await until(page, () => window.__mirio.snapshot().paused);
    const frozen = await snap(page);
    await page.waitForTimeout(450);
    const after = await snap(page);
    assert.equal(after.time, frozen.time);
    assert.deepEqual(after.player.pos, frozen.player.pos);
    assert.ok(await page.isVisible('#pause'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resume');
    await shot(page, 'polish-pause-desktop');
    await page.click('#resume');
    await until(page, () => !window.__mirio.snapshot().paused);
    // Leave W physically held: reset must clear it without a keyup event.
    await gameTime(page, 0.7);
    const settled = await snap(page);
    await gameTime(page, 0.4);
    assert.ok(distance((await snap(page)).player.pos, settled.player.pos) < 0.08, 'movement continued after resume without a fresh key press');
    await page.keyboard.up('KeyW');
  });

  await check('controller Start pauses and resumes while gameplay input is disabled', async () => {
    const start = pressed => page.evaluate(value => {
      window.__testPad.connected = true;
      window.__testPad.buttons[9] = { pressed: value, value: Number(value) };
    }, pressed);
    await start(true);
    await until(page, () => window.__mirio.snapshot().paused);
    await start(false);
    await frames(page);
    const frozen = (await snap(page)).time;
    await page.waitForTimeout(200);
    assert.equal((await snap(page)).time, frozen);
    await start(true);
    await until(page, () => !window.__mirio.snapshot().paused);
    await start(false);
    await frames(page);
    await page.evaluate(() => { window.__testPad.connected = false; });
    await gameTime(page, 0.15);
  });

  await check('rescue returns to the reached checkpoint and resumes safely', async () => {
    const flag = await page.evaluate(() => window.__mirio.layout().flags[0]);
    await teleport(page, flag.planet, flag.dir, 0.1);
    await until(page, () => window.__mirio.snapshot().flags > 0);
    await teleport(page, 'welt', [0, 0, 1], 0);
    await page.click('#pause-button');
    await until(page, () => window.__mirio.snapshot().paused);
    await page.click('#rescue');
    await until(page, () => !window.__mirio.snapshot().paused);
    const rescued = await snap(page);
    const length = Math.hypot(...rescued.player.pos);
    const direction = rescued.player.pos.map(n => n / length);
    assert.ok(distance(direction, flag.dir) < 0.02);
    assert.equal(rescued.player.state, 'play');
    assert.equal(rescued.hearts, 3);
    assert.ok(rescued.flags >= 1);
  });

  await check('music, effects and reduced-motion preferences survive a reload', async () => {
    await page.click('#pause-button');
    await until(page, () => window.__mirio.snapshot().paused);
    for (const [id, value] of [['music-volume', '30'], ['effects-volume', '65']]) {
      await page.locator(`#${id}`).evaluate((element, next) => {
        element.value = next;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
    }
    await page.check('#reduced-motion');
    await page.reload();
    await ready(page);
    assert.equal(await page.inputValue('#music-volume'), '30');
    assert.equal(await page.inputValue('#effects-volume'), '65');
    assert.equal(await page.isChecked('#reduced-motion'), true);
    assert.equal(await page.evaluate(() => document.body.classList.contains('reduced-motion')), true);
  });

  await check('desktop polish features log no browser errors', async () => assert.deepEqual(errors, []));
  await context.close();

  const mobile = await open(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await check('phone landscape title and pause actions remain reachable', async () => {
    await fits(mobile.page, '#start');
    await shot(mobile.page, 'polish-title-landscape');
    await mobile.page.tap('#start');
    await until(mobile.page, () => window.__mirio.snapshot().state === 'play');
    await mobile.page.tap('#pause-button');
    await until(mobile.page, () => window.__mirio.snapshot().paused);
    await fits(mobile.page, '#resume');
    await fits(mobile.page, '#rescue');
    await shot(mobile.page, 'polish-pause-landscape');
  });

  await check('phone portrait title and settings fit without horizontal scrolling', async () => {
    await mobile.page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
    await mobile.page.setViewportSize({ width: 390, height: 844 });
    await fits(mobile.page, '#music-volume');
    await fits(mobile.page, '#rescue');
    await shot(mobile.page, 'polish-pause-portrait');
    await mobile.page.reload();
    await ready(mobile.page);
    await fits(mobile.page, '#start');
    await shot(mobile.page, 'polish-title-portrait');
  });
  await check('phone polish features log no browser errors', async () => assert.deepEqual(mobile.errors, []));
  await mobile.context.close();
} finally {
  await browser.close();
}

console.log(`\n${results.filter(Boolean).length}/${results.length} polish checks passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
