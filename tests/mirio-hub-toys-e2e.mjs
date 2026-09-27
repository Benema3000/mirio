// Ordinary keyboard moves exercise the hub toy and soft boundary; no gameplay teleports.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({...(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
let page = await browser.newPage({viewport: {width: 1100, height: 760}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.evaluate(() => window.__mirio.snapshot());
const wait = (fn, arg) => page.waitForFunction(fn, arg, {timeout: 90000, polling: 70});
async function gameTime(delta) {
  const target = (await snapshot()).hub.time + delta;
  await wait(t => window.__mirio.snapshot().hub.time >= t, target);
}
async function walk(target, duration = 8) {
  await page.evaluate(({target, duration}) => {
    const keys = new Set(), start = window.__mirio.snapshot().hub.time;
    const set = (code, on) => {
      if (keys.has(code) === on) return;
      on ? keys.add(code) : keys.delete(code);
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', {code, bubbles: true}));
    };
    window.hubWalkDone = false;
    function frame() {
      const s = window.__mirio.snapshot(), h = s.hub;
      const d = target.map((v, i) => v - h.pos[i]), distance = Math.hypot(d[0], d[2]);
      if (s.state !== 'hub' || distance < .3 || h.time - start > duration) {
        for (const code of [...keys]) set(code, false);
        window.hubWalkDone = true;
        return;
      }
      const x = d.reduce((sum, n, i) => sum + n * h.right[i], 0) / Math.max(1, distance);
      const y = d.reduce((sum, n, i) => sum + n * h.forward[i], 0) / Math.max(1, distance);
      set('KeyD', x > .23); set('KeyA', x < -.23); set('KeyW', y > .23); set('KeyS', y < -.23);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, {target, duration});
  await wait(() => window.hubWalkDone);
}
try {
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test`);
  await wait(() => window.__mirio && !document.querySelector('#start').disabled);
  await page.click('#start');
  await wait(() => window.__mirio.snapshot().state === 'hub');
  const layout = await page.evaluate(() => window.__mirio.layout().hub);
  await walk(layout.toy);
  await gameTime(.4);
  await page.keyboard.press('ShiftLeft');
  await wait(() => window.__mirio.snapshot().hub.discovery === 1);
  await gameTime(1.3);
  await page.keyboard.down('Space'); await gameTime(.25); await page.keyboard.up('Space');
  await page.keyboard.press('KeyC');
  await wait(() => window.__mirio.snapshot().hub.discovery === 2);
  await gameTime(.25);
  assert.equal((await snapshot()).hub.grounded, false, 'flower must launch an ordinary ground pound');
  await page.screenshot({path: '/tmp/hub-flower.png'});
  await wait(() => window.__mirio.snapshot().hub.grounded);
  await walk([0, 0, 40], 5);
  const h = (await snapshot()).hub;
  assert.ok(Math.hypot(h.pos[0], h.pos[2]) <= layout.boundary + .05);
  assert.equal(h.grounded, true);
  assert.equal((await snapshot()).state, 'hub');
  assert.deepEqual(errors, []);
  console.log('PASS hub spin discovery, stomp spring, and safe boundary through ordinary keyboard controls');

  await page.close();
  page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test`);
  await wait(() => window.__mirio && !document.querySelector('#start').disabled);
  await page.tap('#start');
  await wait(() => window.__mirio.snapshot().state === 'hub');
  await page.screenshot({path: '/tmp/hub-phone.png'});
  for (const id of ['#btn-spin', '#btn-jump', '#btn-pound']) {
    const b = await page.locator(id).boundingBox();
    assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 390 && b.y + b.height <= 844, id);
  }
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: 100, y: 680}]});
  await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: 100, y: 620}]});
  await gameTime(.6);
  await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await gameTime(.4);
  await page.tap('#btn-spin');
  await wait(() => window.__mirio.snapshot().hub.discovery === 1);
  await gameTime(1.3);
  await page.tap('#btn-jump');
  await wait(() => !window.__mirio.snapshot().hub.grounded);
  await page.tap('#btn-pound');
  await wait(() => window.__mirio.snapshot().hub.discovery === 2);
  await gameTime(.2);
  assert.equal((await snapshot()).hub.grounded, false);
  assert.deepEqual(errors, []);
  await page.screenshot({path: '/tmp/hub-touch-flower.png'});
  console.log('PASS hub touch joystick, spin discovery, and jump/stomp spring');
} finally { await browser.close(); }
