// Saved medals are fixtures; movement and spins use ordinary gameplay input.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PERSONAL_BEST_PREFIX} from '../js/course-version.js';
import {HUB, HUB_PORTALS} from '../js/hub-rules.js';

const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({...(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const errors = [];
const until = (page, fn, arg) => page.waitForFunction(fn, arg, {timeout: 90000});
const snapshot = page => page.evaluate(() => window.__mirio.snapshot());

async function open(context, completed) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**', async route => {
    const name = route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body: await readFile(fileURLToPath(new URL('../node_modules/three/', import.meta.url)) + name), contentType: 'text/javascript', headers: {'access-control-allow-origin': '*'}});
  });
  await page.addInitScript(({prefix, completed}) => {
    for (const level of completed) localStorage.setItem(prefix + level, '60000');
  }, {prefix: PERSONAL_BEST_PREFIX, completed});
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test`);
  await until(page, () => window.__mirio && !document.querySelector('#start').disabled);
  await page.click('#start');
  await until(page, () => window.__mirio.snapshot().state === 'hub');
  return page;
}

async function gameTime(page, duration) {
  const target = (await snapshot(page)).hub.time + duration;
  await until(page, target => window.__mirio.snapshot().hub.time >= target, target);
}

async function walk(page, target, arrival = 'stop') {
  await page.evaluate(({target, arrival}) => {
    const held = new Set(), pulse = {x: 0, y: 0}, start = window.__mirio.snapshot().hub.time;
    const press = (code, active) => {
      if (held.has(code) === active) return;
      active ? held.add(code) : held.delete(code);
      window.dispatchEvent(new KeyboardEvent(active ? 'keydown' : 'keyup', {code, bubbles: true}));
    };
    const pilot = window.hubEchoPilot = {done: false, error: null};
    function frame() {
      const s = window.__mirio.snapshot(), h = s.hub, d = target.map((v, i) => v - h.pos[i]);
      const distance = Math.hypot(d[0], d[2]);
      if (s.state !== 'hub' || (arrival === 'stop' && distance < .65) || h.time - start > 12) {
        for (const code of [...held]) press(code, false);
        pilot.error = s.state !== 'hub' ? arrival === 'enter' ? null : 'entered a portal' : distance >= .65 ? 'walk stalled' : null;
        pilot.done = true;
        return;
      }
      const dot = axis => distance < .65 ? 0 : d.reduce((sum, n, i) => sum + n * axis[i], 0) / Math.max(1, distance);
      pulse.x += dot(h.right); pulse.y += dot(h.forward);
      const x = pulse.x > .5 ? 1 : pulse.x < -.5 ? -1 : 0;
      const y = pulse.y > .5 ? 1 : pulse.y < -.5 ? -1 : 0;
      pulse.x -= x; pulse.y -= y;
      press('KeyD', x > 0); press('KeyA', x < 0); press('KeyW', y > 0); press('KeyS', y < 0);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, {target, arrival});
  await until(page, () => window.hubEchoPilot.done);
  assert.equal(await page.evaluate(() => window.hubEchoPilot.error), null);
  if (arrival === 'stop') await gameTime(page, .3);
}

try {
  const context = await browser.newContext({viewport: {width: 1100, height: 760}});
  const page = await open(context, ['sky', 'ribbon']);
  const layout = await page.evaluate(() => window.__mirio.layout().hub);
  assert.equal(layout.portals.length, HUB_PORTALS.length);
  assert.deepEqual((await snapshot(page)).hub.echoes, []);
  await page.screenshot({path: '/tmp/hub-five-desktop.png'});
  for (const level of ['sky', 'ribbon']) {
    await walk(page, layout.souvenirs.find(s => s.level === level).pos);
    assert.equal((await snapshot(page)).hub.actionHint, '↻ ♪ Echo wecken');
    await page.keyboard.press('ShiftLeft');
    await until(page, level => window.__mirio.snapshot().hub.echoes.includes(level), level);
  }
  assert.equal((await snapshot(page)).hub.chorusReady, true);
  assert.equal((await snapshot(page)).hub.actionHint, '♪ Zur Blume');
  await walk(page, layout.toy);
  assert.equal((await snapshot(page)).hub.actionHint, '↻ ♪ Alle singen!');
  await page.keyboard.press('ShiftLeft');
  await until(page, () => window.__mirio.snapshot().hub.chorus);
  await page.screenshot({path: '/tmp/hub-chorus.png'});
  await gameTime(page, HUB.chorusDuration + .2);
  assert.equal((await snapshot(page)).hub.chorus, false);
  assert.equal((await snapshot(page)).state, 'hub');
  assert.equal((await snapshot(page)).time, 0, 'hub discoveries never start the run clock');
  const bests = await page.evaluate(prefix => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => [k.slice(prefix.length), localStorage.getItem(k)])), PERSONAL_BEST_PREFIX);
  assert.deepEqual(bests, {sky: '60000', ribbon: '60000'});
  console.log('PASS ordinary keyboard souvenir loop, flower chorus, expiry, and unchanged records', (await snapshot(page)).rendering);
  await walk(page, layout.portals.find(p => p.level === 'marble').pos, 'enter');
  assert.equal((await snapshot(page)).selectedLevel, 'marble');
  console.log('PASS ordinary walk through the Klangkugel portal');
  await context.close();

  const phone = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, reducedMotion: 'reduce'});
  const phonePage = await open(phone, HUB_PORTALS.map(p => p.level));
  await gameTime(phonePage, .2);
  await phonePage.screenshot({path: '/tmp/hub-five-phone.png'});
  assert.equal((await snapshot(phonePage)).hub.echoTotal, HUB_PORTALS.length);
  for (const id of ['#btn-spin', '#btn-jump', '#btn-pound']) {
    const b = await phonePage.locator(id).boundingBox();
    assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 390 && b.y + b.height <= 844, id);
  }
  console.log('PASS phone layout with every souvenir and reduced motion', (await snapshot(phonePage)).rendering);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
