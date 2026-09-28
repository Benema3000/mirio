import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 800, height: 600}}), errors = [], failures = [];
page.on('pageerror', error => errors.push(error.message));
const wait = fn => page.waitForFunction(fn, null, {timeout: 90000});
const snapshot = () => page.evaluate(() => window.__mirio.snapshot());
const verify = async (name, run) => {
  try { await run(); console.log('PASS', name); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log('FAIL', name, error.message); }
};
async function gate(id) {
  await page.evaluate(id => {
    const gate = window.__mirio.layout().discovery.find(item => item.id === id);
    window.__mirio.teleport(gate.planet, gate.dir, .1);
  }, id);
  await wait(() => window.__mirio.snapshot().player.onGround && !document.querySelector('#discovery-action').hidden);
  await page.keyboard.press('ShiftLeft');
  await page.waitForFunction(id => window.__mirio.snapshot().player.planet === (id === 'exit' ? 'welt' : 'wunderwiese'), id);
}
try {
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test&menu`);
  await wait(() => window.__mirio && !document.querySelector('#start').disabled);
  await page.click('#start');
  await gate('enter');
  await verify('a lit checkpoint works again after leaving and revisiting the planet', async () => {
    const flag = await page.evaluate(() => window.__mirio.layout().flags.find(item => item.planet === 'wunderwiese'));
    await page.evaluate(flag => window.__mirio.teleport(flag.planet, flag.dir, .1), flag);
    await wait(() => window.__mirio.snapshot().flags > 0 && window.__mirio.snapshot().player.onGround);
    await gate('exit'); await gate('enter');
    await page.evaluate(flag => window.__mirio.teleport(flag.planet, flag.dir, .1), flag);
    await wait(() => window.__mirio.snapshot().player.onGround);
    await page.click('#pause-button'); await page.click('#rescue');
    await wait(() => !window.__mirio.snapshot().paused && window.__mirio.snapshot().player.onGround);
    const run = await snapshot();
    const angle = Math.acos(Math.min(1, Math.max(-1, run.player.up.reduce((sum, value, index) => sum + value * flag.dir[index], 0))));
    assert.ok(angle * 26 < 1, `rescue was ${(angle * 26).toFixed(2)}m from the revisited flag`);
  });

  await verify('ordinary low flight collects gems through the shared collection rules', async () => {
    await page.evaluate(() => {
      const home = window.__mirio.layout().bonus.biplane;
      window.__mirio.teleport(home.planet, home.dir, .15);
    });
    await wait(() => window.__mirio.snapshot().player.onGround);
    await page.keyboard.press('KeyF');
    await wait(() => window.__mirio.snapshot().bonus.biplane.mounted);
    const before = (await snapshot()).bits;
    await page.evaluate(() => {
      const api = window.__mirio, layout = api.layout(), target = layout.bonus.trails[0].dirs[4];
      const planet = layout.planets.find(item => item.id === layout.bonus.planet);
      const keys = new Set(), set = (code, down) => {
        if (keys.has(code) === down) return;
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code, bubbles: true}));
        down ? keys.add(code) : keys.delete(code);
      };
      window.flightPickup = {done: false, closest: Infinity};
      const timer = setInterval(() => {
        const plane = api.snapshot().bonus.biplane;
        const distance = Math.acos(Math.min(1, Math.max(-1, target.reduce((sum, value, index) => sum + value * plane.up[index], 0)))) * planet.radius;
        window.flightPickup.closest = Math.min(window.flightPickup.closest, distance);
        if (distance < 1) {
          for (const key of keys) set(key, false);
          window.flightPickup.done = true; clearInterval(timer); return;
        }
        api.aim(target.map((value, index) => planet.center[index] + value * planet.radius - plane.pos[index]));
        set('KeyW', distance > 3 || api.snapshot().time % .3 < .1);
      }, 40);
    });
    await wait(() => window.flightPickup.done);
    assert.ok((await snapshot()).bits > before, 'passing through gems while flying left the gem count unchanged');
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally { await browser.close(); }
