// Stage isolated toys; every interaction still travels through ordinary device input.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const wait = fn => page.waitForFunction(fn, null, {timeout: 90000});
const snapshot = () => page.evaluate(() => window.__mirio.snapshot());
try {
  await page.addInitScript(() => {
    window.pad = {connected: false, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 16}, () => ({pressed: false, value: 0}))};
    Object.defineProperty(navigator, 'getGamepads', {value: () => [window.pad]});
  });
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test&menu`);
  await wait(() => window.__mirio && !document.querySelector('#start').disabled);
  console.log('BOOT');
  await page.tap('#start');
  await page.evaluate(() => {
    const home = window.__mirio.layout().bonus.biplane;
    window.__mirio.teleport(home.planet, home.dir, .15);
  });
  await wait(() => window.__mirio.snapshot().player.onGround);
  console.log('PHONE at plane');
  await page.tap('#discovery-action');
  await wait(() => window.__mirio.snapshot().bonus.biplane.mounted);
  console.log('BOARDED');
  const touch = await context.newCDPSession(page);
  const buttonPoint = async selector => {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, selector);
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
  };
  const jump = await buttonPoint('#btn-jump');
  await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...jump, id: 1}]});
  await wait(() => window.__mirio.snapshot().bonus.biplane.altitude > 2.5);
  await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.tap('#btn-spin');
  await wait(() => window.__mirio.snapshot().bonus.biplane.boost > 0);
  for (const selector of ['#bonus-hud', '#discovery-action', '#btn-pound', '#btn-spin']) await buttonPoint(selector);
  await page.tap('#pause-button');
  const paused = (await snapshot()).bonus.biplane;
  await page.waitForTimeout(250);
  assert.deepEqual((await snapshot()).bonus.biplane, paused);
  await page.check('#reduced-motion');
  await page.tap('#rescue');
  await wait(() => !window.__mirio.snapshot().paused && window.__mirio.snapshot().player.onGround);
  assert.equal((await snapshot()).bonus.biplane.mounted, false);
  console.log('PASS touch boarding, ascent, boost, pause, rescue and portrait layout');

  // Rescue uses the adventure checkpoint; stage the plane again for controller checks.
  await page.evaluate(() => {
    const home = window.__mirio.layout().bonus.biplane;
    window.__mirio.teleport(home.planet, home.dir, .15); window.pad.connected = true;
  });
  await wait(() => window.__mirio.snapshot().player.onGround);
  await page.evaluate(() => {window.pad.buttons[3] = {pressed: true, value: 1};});
  await wait(() => window.__mirio.snapshot().bonus.biplane.mounted);
  await page.evaluate(() => {window.pad.buttons[3] = {pressed: false, value: 0}; window.pad.buttons[0] = {pressed: true, value: 1};});
  await wait(() => window.__mirio.snapshot().bonus.biplane.altitude > 2.7);
  await page.evaluate(() => {window.pad.buttons[0] = {pressed: false, value: 0}; window.pad.buttons[1] = {pressed: true, value: 1};});
  await wait(() => window.__mirio.snapshot().bonus.biplane.altitude < 1.3);
  await page.evaluate(() => {window.pad.buttons[1] = {pressed: false, value: 0}; window.pad.buttons[3] = {pressed: true, value: 1};});
  await wait(() => !window.__mirio.snapshot().bonus.biplane.mounted);
  await page.evaluate(() => {window.pad.connected = false; window.pad.buttons[3] = {pressed: false, value: 0};});
  await wait(() => window.__mirio.snapshot().player.onGround);
  console.log('PASS controller Y boarding/landing, A climb, B descent with reduced motion');

  await page.evaluate(() => {
    const api = window.__mirio, layout = api.layout(), cloud = layout.bonus.moon.platforms[0], planet = layout.planets.find(item => item.id === layout.bonus.planet);
    const relative = cloud.pos.map((value, index) => value - planet.center[index]), radius = Math.hypot(...relative);
    api.teleport(planet.id, relative.map(value => value / radius), radius - planet.radius + .1);
  });
  await wait(() => window.__mirio.snapshot().bonus.moon.visited.length > 0);
  const cloudStart = (await snapshot()).player.pos;
  await page.waitForFunction(start => {
    const now = window.__mirio.snapshot().player.pos;
    return Math.hypot(...now.map((value, index) => value - start[index])) > .05;
  }, cloudStart, {timeout: 90000});
  await page.evaluate(() => {
    const api = window.__mirio, layout = api.layout(), guardian = layout.bonus.moon.guardian, planet = layout.planets.find(item => item.id === layout.bonus.planet);
    const relative = guardian.pos.map((value, index) => value - planet.center[index]);
    api.teleport(planet.id, guardian.up, Math.hypot(...relative) - planet.radius + .1);
  });
  await wait(() => window.__mirio.snapshot().bonus.moon.launches > 0);
  await wait(() => window.__mirio.snapshot().player.onGround && window.__mirio.snapshot().player.height > 7);
  await wait(() => window.__mirio.snapshot().bonus.moon.visited.includes('moon-cloud-5'));
  console.log('PASS drifting cloud ride and guardian landing on final cloud');
  console.log('PHONE render budget', JSON.stringify((await snapshot()).rendering));
  // Touch enters the branch race, then its explicit return restores the side trip.
  await page.evaluate(() => {
    const gate = window.__mirio.layout().discovery.find(item => item.id === 'race');
    window.__mirio.teleport(gate.planet, gate.dir, .1);
  });
  await wait(() => window.__mirio.snapshot().player.onGround);
  await page.tap('#discovery-action');
  await wait(() => window.__mirio.snapshot().state === 'race');
  assert.ok((await snapshot()).race.forks.length > 0);
  await page.tap('#pause-button');
  await page.tap('#bonus-return');
  await wait(() => window.__mirio.snapshot().state === 'play' && window.__mirio.snapshot().player.planet === 'wunderwiese');
  assert.equal((await snapshot()).bonus.moon.launches, 1);
  console.log('PASS touch race warp and return preserve discoveries');
  // Controller X takes the return gate; a held button never bounces back.
  await page.evaluate(() => {
    const gate = window.__mirio.layout().discovery.find(item => item.id === 'exit');
    window.__mirio.teleport(gate.planet, gate.dir, .1); window.pad.connected = true;
  });
  await wait(() => window.__mirio.snapshot().player.onGround);
  await wait(() => !document.querySelector('#discovery-action').hidden);
  await page.evaluate(() => {window.pad.buttons[2] = {pressed: true, value: 1};});
  await wait(() => window.__mirio.snapshot().player.planet === 'welt');
  await page.waitForTimeout(200);
  assert.equal((await snapshot()).player.planet, 'welt');
  await page.evaluate(() => {window.pad.buttons[2] = {pressed: false, value: 0}; window.pad.connected = false;});
  console.log('PASS controller gate return and held-button guard');
  assert.deepEqual(errors, []);
  if (process.env.SHOTS) await page.screenshot({path: `${process.env.SHOTS}/bonus-phone-cloud.png`});
} catch (error) {
  console.log('FAIL', errors, await page.evaluate(() => window.__mirio?.snapshot()));
  if (process.env.SHOTS) await page.screenshot({path: `${process.env.SHOTS}/bonus-device-failure.png`});
  throw error;
} finally { await browser.close(); }
