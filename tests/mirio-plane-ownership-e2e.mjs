// Stage nearby landings; boarding, flight and rescue use ordinary device input.
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const PHONE = {width: 390, height: 844};
const TIMEOUT = 90000;
const context = await browser.newContext({viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const wait = (fn, arg) => page.waitForFunction(fn, arg, {timeout: TIMEOUT});
const snapshot = () => page.evaluate(() => window.__mirio.snapshot());
const plane = (run, kind) => kind === 'meadow' ? run.biplane : run.bonus.biplane;

async function stagePlane(kind) {
  await page.evaluate(kind => {
    const api = window.__mirio;
    const home = kind === 'meadow' ? api.layout().biplane : api.layout().bonus.biplane;
    const radius = api.layout().planets.find(planet => planet.id === home.planet).radius;
    const side = home.dir.map((value, index) => (index === 0 ? 1 : 0) - home.dir[0] * value);
    const length = Math.hypot(...side), angle = 3 / radius;
    const near = home.dir.map((value, index) => value * Math.cos(angle) + side[index] / length * Math.sin(angle));
    api.teleport(home.planet, near, .15);
  }, kind);
  await wait(() => window.__mirio.snapshot().player.onGround);
}

async function assertOwnership(kind) {
  const run = await snapshot();
  assert.equal(run.biplane.mounted, kind === 'meadow');
  assert.equal(run.bonus.biplane.mounted, kind === 'bonus');
  assert.equal(run.player.state, 'biplane');
  assert.equal(run.player.planet, plane(run, kind).planet);
}

async function assertFits(selector) {
  assert.ok(await page.locator(selector).isVisible(), selector);
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= PHONE.width && box.y + box.height <= PHONE.height,
    `${selector} must fit the portrait screen`);
}

async function rescue() {
  await page.tap('#pause-button');
  const before = await snapshot();
  assert.ok(before.paused);
  await page.tap('#rescue');
  await wait(() => !window.__mirio.snapshot().paused && window.__mirio.snapshot().player.onGround);
  const after = await snapshot();
  assert.equal(after.biplane.mounted || after.bonus.biplane.mounted, false);
  assert.equal(after.player.state, 'play');
  assert.equal(after.biplane.distance, before.biplane.distance);
  assert.equal(after.bonus.biplane.distance, before.bonus.biplane.distance);
}

try {
  await page.addInitScript(() => {
    window.pad = {connected: false, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({length: 16}, () => ({pressed: false, value: 0}))};
    Object.defineProperty(navigator, 'getGamepads', {value: () => [window.pad]});
  });
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test&menu`);
  await wait(() => window.__mirio && !document.querySelector('#start').disabled);
  await page.tap('#start');
  await stagePlane('meadow');
  await assertFits('#ride-action');
  assert.equal(await page.locator('#discovery-action').isVisible(), false);
  const parkedBonus = (await snapshot()).bonus.biplane;
  await page.keyboard.press('KeyF');
  await wait(() => window.__mirio.snapshot().biplane.mounted);
  await assertOwnership('meadow');
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyW');
  await wait(() => window.__mirio.snapshot().biplane.altitude > 1.5 && window.__mirio.snapshot().biplane.distance > 2);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  assert.deepEqual((await snapshot()).bonus.biplane, parkedBonus, 'the original plane must not move the bonus plane');
  await assertFits('#plane-hud');
  assert.equal(await page.locator('#btn-jump').getAttribute('aria-label'), 'Steigen');
  assert.equal(await page.locator('#btn-pound').getAttribute('aria-label'), 'Sinken');
  await rescue();
  console.log('PASS original meadow plane: F, movement, separate ownership and rescue');

  await page.evaluate(() => {
    const gate = window.__mirio.layout().discovery.find(item => item.id === 'enter');
    window.__mirio.teleport(gate.planet, gate.dir, .15);
  });
  await wait(() => window.__mirio.snapshot().player.onGround && !document.querySelector('#discovery-action').hidden);
  await page.keyboard.press('ShiftLeft');
  await wait(() => window.__mirio.snapshot().player.planet === 'wunderwiese' && window.__mirio.snapshot().player.onGround);
  await page.evaluate(() => {window.pad.connected = true;});
  await wait(() => document.querySelector('#discovery-action').textContent.includes('Y'));
  assert.equal(await page.locator('#ride-action').isVisible(), false);
  const parkedMeadow = (await snapshot()).biplane;
  await page.evaluate(() => {window.pad.buttons[3] = {pressed: true, value: 1};});
  await wait(() => window.__mirio.snapshot().bonus.biplane.mounted);
  await assertOwnership('bonus');
  await page.evaluate(() => {
    window.pad.buttons[3] = {pressed: false, value: 0};
    window.pad.buttons[0] = {pressed: true, value: 1};
    window.pad.axes[1] = -1;
  });
  await wait(() => window.__mirio.snapshot().bonus.biplane.altitude > 1.5 && window.__mirio.snapshot().bonus.biplane.distance > 2);
  await page.evaluate(() => {
    window.pad.buttons[0] = {pressed: false, value: 0}; window.pad.axes[1] = 0; window.pad.connected = false;
  });
  assert.deepEqual((await snapshot()).biplane, parkedMeadow, 'the bonus plane must not move the original plane');
  assert.equal(await page.locator('#plane-hud').isVisible(), false);
  await assertFits('#bonus-hud');
  await assertFits('#discovery-action');
  await rescue();
  assert.equal((await snapshot()).player.planet, 'wunderwiese');
  console.log('PASS discovery gate and bonus plane: Y, movement, separate ownership and rescue');

  // Each planet's visible context button must board its own parked plane.
  for (const kind of ['meadow', 'bonus']) {
    await stagePlane(kind);
    const selector = kind === 'meadow' ? '#ride-action' : '#discovery-action';
    await assertFits(selector);
    await page.tap(selector);
    await wait(kind => {
      const run = window.__mirio.snapshot();
      return kind === 'meadow' ? run.biplane.mounted : run.bonus.biplane.mounted;
    }, kind);
    await assertOwnership(kind);
    assert.equal(await page.locator('#btn-jump').getAttribute('aria-label'), 'Steigen');
    assert.equal(await page.locator('#btn-pound').getAttribute('aria-label'), 'Sinken');
    await rescue();
  }
  assert.deepEqual(errors, []);
  console.log('PASS portrait touch boarding and flight prompts for both planes');
} catch (error) {
  console.error('FAIL', errors, await page.evaluate(() => window.__mirio?.snapshot()));
  throw error;
} finally {
  await browser.close();
}
