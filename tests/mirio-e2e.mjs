// End-to-end run of Mirio in real browsers: desktop keyboard play through
// every station of the level, touch controls on a phone-sized screen, and a
// start-and-walk check in WebKit.
//
// Serve this folder with PHP (the time board is api/times.php), then:
//   MIRIO_SCORES_DIR=/tmp/mirio-scores php -S 127.0.0.1:8766
//   node tests/mirio-e2e.mjs
// PLAYWRIGHT can point at a playwright module outside this repo; SHOTS=<dir>
// saves screenshots. The game's ?test hook (js/main.js) exposes state and a
// teleport, so the long walks between the interesting moments are skipped.
import assert from 'node:assert/strict';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const GAME_URL = `${BASE}?test&menu`;
const SHOTS = process.env.SHOTS;
// Software WebGL for headless Chromium on a box without a GPU.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log(`ok   ${name}`);
  } catch (err) {
    results.push(['FAIL', name]);
    console.log(`FAIL ${name}\n     ${err.message.split('\n')[0]}`);
  }
}

async function open(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  // The only other host the game may talk to is jsDelivr, for the pinned
  // three.js (MIRIO.md).
  const allowed = [new URL(BASE).origin, 'https://cdn.jsdelivr.net/npm/three@0.186.0/', 'data:'];
  page.on('request', (r) => {
    if (!allowed.some((a) => r.url().startsWith(a))) errors.push(`unexpected request: ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(GAME_URL, {waitUntil: 'domcontentloaded', timeout: 120000});
  // Generous: software WebGL on a busy box can take a minute to build the scene.
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 120000 });
  return { page, errors };
}

const snap = (page) => page.evaluate(() => window.__mirio.snapshot());
const layout = (page) => page.evaluate(() => window.__mirio.layout());
const teleport = (page, id, dir, height) => page.evaluate(([i, d, h]) => window.__mirio.teleport(i, d, h), [id, dir, height]);
// Software WebGL shares the host CPU. Assertions still wait on actual state;
// the wall-clock budget must allow the same simulation on a busy machine.
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout: Math.max(30000, timeout), polling: 100 });
const gameTime = async (page, seconds) => { const before = await snap(page); await until(page, t => window.__mirio.snapshot().time >= t, before.time + seconds, 60000); };
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

function sub(a, b) {
  return a.map((v, i) => v - b[i]);
}
/** Direction `dir` tilted by `angle` radians toward some perpendicular. */
function offsetDir(dir, angle) {
  const side = norm(Math.abs(dir[1]) < 0.9 ? [dir[2], 0, -dir[0]] : [1, 0, 0]);
  return norm(dir.map((v, i) => v * Math.cos(angle) + side[i] * Math.sin(angle)));
}
function norm(a) {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
}
// ---- Desktop: the whole level with the keyboard -------------------------
{
  const browser = await chromium.launch({ args: GL_ARGS });
  const { page, errors } = await open(browser, { viewport: { width: 1280, height: 720 } });
  await shot(page, 'd01-title');

  await check('the title screen opens the selected adventure’s time board', async () => {
    await page.click('#show-times');
    await until(page, () => document.querySelector('#title-board li'), null, 10000);
    assert.ok(await page.isVisible('#title-scores'));
    assert.ok((await page.$$('#title-board li')).length <= 5);
    await page.click('[data-close="scores-dialog"]');
  });

  await check('start button begins the game in fullscreen', async () => {
    await page.click('#start');
    await until(page, () => window.__mirio.snapshot().state === 'play');
    assert.equal(await page.isVisible('#title'), false);
    await until(page, () => document.fullscreenElement === document.documentElement, null, 5000);
  });

  await check('arrow keys walk Mirio and collect Glitzersteine', async () => {
    const before = await snap(page);
    // Measure simulated play time: first-frame shader compilation can take
    // most of a wall-clock delay in the software renderer.
    await page.keyboard.down('ArrowUp');
    await until(page, time => window.__mirio.snapshot().time >= time, before.time + 1);
    await page.keyboard.up('ArrowUp');
    const after = await snap(page);
    const moved = Math.hypot(...sub(after.player.pos, before.player.pos));
    assert.ok(moved > 2, `moved only ${moved.toFixed(2)}`);
    assert.ok(after.player.onGround);
    assert.ok(after.bits > 0, 'no Glitzerstein collected');
    await shot(page, 'd02-walk');
  });

  await check('space jumps and Mirio lands again', async () => {
    await page.keyboard.down('Space');
    await until(page, () => !window.__mirio.snapshot().player.onGround, null, 3000);
    await page.keyboard.up('Space');
    await until(page, () => window.__mirio.snapshot().player.onGround, null, 5000);
  });

  await check('pressing C in mid-air ground-pounds', async () => {
    const before = (await snap(page)).pounds;
    await page.keyboard.press('Space');
    await until(page, () => !window.__mirio.snapshot().player.onGround, null, 3000);
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyC');
    await until(page, (n) => window.__mirio.snapshot().pounds > n, before, 5000);
  });

  await check('running and jumping again on landing builds up to a triple jump', async () => {
    // An open stretch of the equator, running east. Keys are pressed from a
    // per-frame loop inside the page, so the landing window is hit exactly.
    const la = (-4 * Math.PI) / 180;
    const lo = (100 * Math.PI) / 180;
    await page.evaluate(([d, east]) => {
      window.__mirio.teleport('welt', d, 0);
      window.__mirio.aim(east);
    }, [[Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)], [-Math.sin(lo), 0, Math.cos(lo)]]);
    await until(page, () => window.__mirio.snapshot().player.onGround);
    const best = await page.evaluate(() => new Promise((resolve) => {
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
      key('keydown', 'ArrowUp');
      const t0 = window.__mirio.snapshot().time;
      let jumped = 0;
      const tick = () => {
        const s = window.__mirio.snapshot();
        const elapsed = (s.time - t0) * 1000;
        // Wait for full speed, then jump each time the feet touch down.
        if (elapsed > 1200 && s.player.onGround && performance.now() - jumped > 150) {
          key('keydown', 'Space');
          jumped = performance.now();
          setTimeout(() => key('keyup', 'Space'), 120);
        }
        if (s.bestJump >= 3 || elapsed > 12000) {
          key('keyup', 'ArrowUp');
          resolve(s.bestJump);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    assert.equal(best, 3, `best jump level ${best}`);
    await shot(page, 'd02b-triple');
  });

  const map = await layout(page);
  const latDir = (lat, lon) => {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180;
    return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  };

  await check('a flag becomes the checkpoint', async () => {
    await teleport(page, 'welt', map.flags[0].dir, 0.3);
    await until(page, () => window.__mirio.snapshot().flags >= 1, null, 5000);
  });

  await check('falling into the lake splashes and puts Mirio back at the flag', async () => {
    const lat = (map.lake.minLat + map.lake.maxLat) / 2;
    await teleport(page, 'welt', latDir(lat, 12), 0.5);
    await until(page, () => window.__mirio.snapshot().splashes >= 1, null, 5000);
    await shot(page, 'd03-splash');
    await until(page, () => window.__mirio.snapshot().player.state === 'play', null, 5000);
    const s = await snap(page);
    const flag = map.flags[0].dir;
    const up = norm(s.player.pos);
    assert.ok(Math.acos(Math.min(1, up.reduce((a, v, i) => a + v * flag[i], 0))) < 0.1, 'not back at the flag');
  });

  await check('a stepping stone holds Mirio above the water', async () => {
    const stone = map.stones[0];
    await teleport(page, 'welt', stone.dir, stone.top + 0.4);
    await until(page, () => window.__mirio.snapshot().player.onGround);
    const s = await snap(page);
    assert.ok(s.player.onGround, 'not standing');
    assert.equal(s.splashes, 1);
    assert.ok(Math.abs(s.player.height - stone.top) < 0.1, `height ${s.player.height}`);
    await shot(page, 'd04-stone');
  });

  await check('walking into the rocket counts down and flies Mirio to the moon', async () => {
    await teleport(page, 'welt', map.rocket.dir, map.rocket.height + 0.2);
    await until(page, () => window.__mirio.snapshot().rocket === 'countdown', null, 5000);
    await shot(page, 'd05-countdown');
    await until(page, () => window.__mirio.snapshot().rocket === 'flight', null, 10000);
    await page.waitForTimeout(1500);
    await shot(page, 'd06-flight');
    await until(page, () => {
      const s = window.__mirio.snapshot();
      return s.rocket === 'landed' && s.player.planet === 'mond' && s.player.onGround;
    }, null, 90000);
    await page.waitForTimeout(600);
    await shot(page, 'd07-moon');
  });

  await check('on the moon Mirio jumps much higher', async () => {
    await page.keyboard.down('Space');
    let top;
    try {
      await until(page, () => window.__mirio.snapshot().player.height > 5);
      top = (await snap(page)).player.height;
    } finally { await page.keyboard.up('Space'); }
    assert.ok(top > 5, `moon jump only ${top.toFixed(2)} high`);
    await until(page, () => window.__mirio.snapshot().player.onGround, null, 8000);
  });

  await check('the floor blocks on the moon can be stood on', async () => {
    const top = map.blocks.filter((b) => b.planet === 'mond').sort((a, b) => b.top - a.top)[1];
    await teleport(page, 'mond', top.dir, top.top + 0.4);
    await until(page, () => window.__mirio.snapshot().player.onGround);
    const s = await snap(page);
    assert.ok(s.player.onGround && Math.abs(s.player.height - top.top) < 0.15, `height ${s.player.height}`);
    await shot(page, 'd08-blocks');
  });

  const arena = map.arena;
  const above = (pos, up, h) => pos.map((v, i) => v + up[i] * h);

  await check('landing on the arena starts the fight with Finster-Mirio', async () => {
    // Near the rim: the boss stands in the middle.
    await teleport(page, 'mond', offsetDir(arena.dir, 0.22), arena.top + 0.3);
    await until(page, () => window.__mirio.snapshot().fight, null, 8000);
    const s = await snap(page);
    assert.notEqual(s.boss.state, 'idle');
    assert.equal(s.hearts, 3);
    assert.ok(await page.isVisible('#boss-bar'));
    await page.waitForTimeout(800);
    await shot(page, 'd10-boss');
  });

  await check('the crystal is locked in a bubble until the boss is beaten', async () => {
    await teleport(page, 'mond', map.goal.dir, map.goal.height - 1);
    await page.waitForTimeout(600);
    const s = await snap(page);
    assert.equal(s.winVisible, false);
    assert.equal(s.state, 'play');
    assert.equal(s.bubble, true);
    // Off the arena again before the boss reaches the middle.
    await teleport(page, 'mond', offsetDir(arena.dir, 0.45), arena.top + 12);
  });

  await check('jumping on the dizzy boss three times beats him', async () => {
    const moon = map.planets.find((p) => p.id === 'mond');
    // Between rounds wait high above the arena rim, out of the shockwave's way.
    const safe = offsetDir(arena.dir, 0.45);
    for (let hit = 1; hit <= 3; hit++) {
      await teleport(page, 'mond', safe, arena.top + 12);
      // One attack round is ~6 s of game time; software WebGL under load can
      // run the game at a third of real speed.
      await until(page, () => window.__mirio.snapshot().boss.state === 'dizzy', null, 90000);
      const s = await snap(page);
      const up = norm(sub(s.boss.pos, moon.center));
      const dir = norm(sub(above(s.boss.pos, up, 7.5), moon.center));
      const h = Math.hypot(...sub(above(s.boss.pos, up, 7.5), moon.center)) - moon.radius;
      await teleport(page, 'mond', dir, h);
      await until(page, (n) => window.__mirio.snapshot().boss.hp <= n, 3 - hit, 15000);
      if (hit === 1) await shot(page, 'd11-boss-hit');
    }
    await until(page, () => window.__mirio.snapshot().boss.defeated, null, 5000);
    // The bubble pops once his vanishing act is over.
    await until(page, () => !window.__mirio.snapshot().bubble, null, 15000);
  });

  await check('beating the boss plays the cutscene and puts Mirio in the kart', async () => {
    await until(page, () => window.__mirio.snapshot().state === 'cutscene', null, 15000);
    await shot(page, 'd12-cutscene');
    await until(page, () => ['intro', 'countdown', 'race'].includes(window.__mirio.snapshot().race.state), null, 30000);
    await shot(page, 'd13-kart-intro');
    await until(page, () => window.__mirio.snapshot().race.state === 'race', null, 60000);
    assert.ok(await page.isVisible('#race-hud'));
  });

  await check('the kart needs gas, steers, brakes, hops on Space, and crosses the finish', async () => {
    await page.waitForTimeout(800);
    assert.ok((await snap(page)).race.speed < 0.5, 'the kart should stand until you give gas');
    const before = (await snap(page)).race.progress;
    await page.keyboard.down('ArrowUp');
    await until(page, () => window.__mirio.snapshot().race.speed > 8, null, 20000);
    await page.keyboard.down('ArrowLeft');
    await gameTime(page, 1);
    await page.keyboard.up('ArrowLeft');
    const moved = (await snap(page)).race.progress;
    assert.ok(moved > before, `no progress: ${before} -> ${moved}`);
    await shot(page, 'd14-race');
    // Off the gas and on the brake: it stops.
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowDown');
    await until(page, () => window.__mirio.snapshot().race.speed < 1, null, 20000);
    await page.keyboard.up('ArrowDown');
    // Gas again, then a Space tap: the kart leaves the ground and lands.
    await page.keyboard.down('ArrowUp');
    await until(page, () => window.__mirio.snapshot().race.speed > 10, null, 20000);
    await page.keyboard.down('Space');
    await until(page, () => window.__mirio.snapshot().race.height > 0.2, null, 20000);
    await page.keyboard.up('Space');
    await shot(page, 'd14-hop');
    await until(page, () => window.__mirio.snapshot().race.height < 0.05, null, 10000);
    await page.evaluate(() => window.__mirio.raceSkip(0.97));
    await until(page, () => window.__mirio.snapshot().race.state === 'finished', null, 60000);
    await page.keyboard.up('ArrowUp');
    await shot(page, 'd15-finish');
    await until(page, () => window.__mirio.snapshot().winVisible, null, 30000);
    assert.match(await page.textContent('#win-stats'), /Kartrennen: \d\. Platz/);
    await shot(page, 'd16-win');
  });

  await check('the win screen puts a name on the public high score list', async () => {
    assert.ok(await page.isVisible('#score-form'), 'no name form: the run got no token from api/times.php');
    assert.match(await page.textContent('#win-time'), /^\d+:\d{2}\.\d{2}$/);
    await page.fill('#score-name', 'Arschloch');
    await page.click('#score-send');
    await until(page, () => /geht leider nicht/.test(document.getElementById('score-status').textContent), null, 10000);
    assert.ok(await page.isVisible('#score-form'), 'a refused name should let you try another');
    // Chromium logs the refusal's 400 as a console error: that one is expected.
    const refusal = errors.findIndex((e) => /status of 400/.test(e));
    assert.ok(refusal >= 0, 'the refused name should have come back as a 400');
    errors.splice(refusal, 1);
    // Typed, not filled: Space and the WASD letters are game keys too.
    await page.fill('#score-name', '');
    await page.type('#score-name', 'Sams Wade');
    assert.equal(await page.inputValue('#score-name'), 'Sams Wade');
    await page.keyboard.press('Enter');
    await until(page, () => /Platz \d+|stimmt|erreichbar/.test(document.getElementById('score-status').textContent), null, 10000);
    assert.match(await page.textContent('#score-status'), /Platz \d+/);
    assert.equal(await page.isVisible('#score-form'), false);
    assert.equal((await page.textContent('#win-board .mine .name'))?.trim(), 'Sams Wade');
    await shot(page, 'd17-high-score');
  });

  await check('"Nochmal spielen" starts over with the rocket back on its pad', async () => {
    await page.click('#again');
    await until(page, () => window.__mirio.snapshot().state === 'play', null, 3000);
    const s = await snap(page);
    assert.equal(s.player.planet, 'welt');
    assert.equal(s.rocket, 'pad');
    assert.equal(s.flags, 0);
    assert.equal(s.race.state, 'idle');
    assert.equal(await page.isVisible('#race-hud'), false);
    assert.ok(s.bits <= 1, `bits carried over: ${s.bits}`);
  });

  await check('desktop run logged no errors', async () => {
    assert.deepEqual(errors, []);
  });
  await browser.close();
}

// ---- Phone: touch stick and blob buttons --------------------------------
{
  const browser = await chromium.launch({ args: GL_ARGS });
  const { page, errors } = await open(browser, {
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  await shot(page, 'm01-title');

  await check('phone: tap on start shows the touch controls', async () => {
    await page.tap('#start');
    await until(page, () => window.__mirio.snapshot().state === 'play');
    assert.ok(await page.isVisible('#btn-jump'));
    assert.ok(await page.isVisible('#btn-spin'));
    assert.ok(await page.isVisible('#btn-pound'));
    await until(page, () => document.fullscreenElement === document.documentElement, null, 5000);
  });

  await check('phone: dragging on the left half walks Mirio', async () => {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
    const before = await snap(page);
    await touch('touchStart', 160, 260);
    for (let y = 250; y >= 190; y -= 10) await touch('touchMove', 160, y);
    await gameTime(page, 1);
    await shot(page, 'm02-stick');
    await touch('touchEnd');
    const after = await snap(page);
    const moved = Math.hypot(...sub(after.player.pos, before.player.pos));
    assert.ok(moved > 2, `moved only ${moved.toFixed(2)}`);
  });

  await check('phone: the jump button jumps', async () => {
    await until(page, () => window.__mirio.snapshot().player.onGround);
    await page.tap('#btn-jump');
    await until(page, () => !window.__mirio.snapshot().player.onGround, null, 3000);
  });

  await check('phone: in the race the right-hand buttons are gas and brake', async () => {
    await page.evaluate(() => window.__mirio.raceNow());
    await until(page, () => window.__mirio.snapshot().race.state === 'race', null, 60000);
    assert.ok(await page.isVisible('#btn-gas'));
    assert.ok(await page.isVisible('#btn-brake'));
    assert.equal(await page.isVisible('#btn-spin'), false);
    // Real touches: a button holds on to its finger (pointer capture).
    const cdp = await page.context().newCDPSession(page);
    const hold = async (id, down) => {
      const box = await page.locator(id).boundingBox();
      await cdp.send('Input.dispatchTouchEvent', {
        type: down ? 'touchStart' : 'touchEnd',
        touchPoints: down ? [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 3 }] : [],
      });
    };
    assert.ok(Math.abs((await snap(page)).race.speed) < 0.01, 'without gas the kart should stand still');
    await hold('#btn-gas', true);
    await until(page, () => window.__mirio.snapshot().race.speed > 8, null, 20000);
    await shot(page, 'm04-race');
    await hold('#btn-gas', false);
    await hold('#btn-brake', true);
    await until(page, () => window.__mirio.snapshot().race.speed < 1, null, 20000);
    await hold('#btn-brake', false);
  });

  await check('phone: portrait still fits the HUD and buttons', async () => {
    // Playwright cannot resize a fullscreen window; a real phone just rotates.
    await page.evaluate(() => document.exitFullscreen());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const box = await page.locator('#btn-jump').boundingBox();
    assert.ok(box && box.x + box.width <= 390 && box.y + box.height <= 844, 'jump button off screen');
    await shot(page, 'm03-portrait');
  });

  await check('phone run logged no errors', async () => {
    assert.deepEqual(errors, []);
  });
  await browser.close();
}

// ---- WebKit (Safari's engine) ----------------------------------------------
for (const [name, engine] of [['webkit', webkit]]) {
  const browser = await engine.launch();
  const { page, errors } = await open(browser, { viewport: { width: 1024, height: 640 } });
  await check(`${name}: the game starts and Mirio walks`, async () => {
    await page.click('#start');
    await until(page, () => window.__mirio.snapshot().state === 'play');
    // Software WebGL can be slow here, and the game clamps each frame to
    // 1/15 s: measure distance walked, not bits collected.
    const before = await snap(page);
    // WebKit's software renderer manages 1-2 fps with the full scenery and
    // sometimes stalls for seconds: hold the key until he has moved.
    await page.keyboard.down('ArrowUp');
    await until(page, (p0) => {
      const p = window.__mirio.snapshot().player.pos;
      return Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) > 1;
    }, before.player.pos, 90000).catch(() => {});
    await page.keyboard.up('ArrowUp');
    const after = await snap(page);
    const moved = Math.hypot(...sub(after.player.pos, before.player.pos));
    console.log(`     ${name}: ${after.fps.toFixed(1)} fps, walked ${moved.toFixed(2)}`);
    assert.ok(moved > 0.5, `Mirio did not move in ${name}`);
    await shot(page, `x-${name}`);
  });
  await check(`${name} run logged no errors`, async () => {
    assert.deepEqual(errors, []);
  });
  await browser.close();
}

const failed = results.filter(([r]) => r === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
