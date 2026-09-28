// Cross-browser entry and movement through the production hub. No seeks or teleports.
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {CHAPTERS} from '../js/chapters.js';

const TIMEOUT = Number(process.env.TIMEOUT_MS ?? 120000);
assert.ok(Number.isFinite(TIMEOUT) && TIMEOUT > 0, 'TIMEOUT_MS must be positive');
const levelIds = process.env.LEVELS === undefined ? Object.keys(CHAPTERS) : [...new Set(process.env.LEVELS.split(',').map(id => id.trim()))];
assert.ok(levelIds.length && levelIds.every(id => Object.hasOwn(CHAPTERS, id)), 'LEVELS must name existing journeys');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.0/';
const browserName = process.env.BROWSER ?? 'chromium';
const playwright = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browserType = playwright[browserName];
assert.ok(browserType?.launch, `Unsupported browser: ${browserName}`);
const executablePath = browserName === 'webkit' ? process.env.WEBKIT : browserName === 'chromium' ? process.env.CHROMIUM : undefined;
const args = browserName === 'chromium' ? ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
const browser = await browserType.launch({args, ...(executablePath ? {executablePath} : {})});
const context = await browser.newContext({viewport: {width: 900, height: 650}, deviceScaleFactor: 1});
const page = await context.newPage(), errors = [];
page.setDefaultTimeout(TIMEOUT);
page.setDefaultNavigationTimeout(TIMEOUT);
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
});
const snapshot = () => page.evaluate(() => window.__mirio.snapshot());
const wait = (predicate, argument) => page.waitForFunction(predicate, argument, {timeout: TIMEOUT, polling: 75});
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
async function shot(name) {
  if (!process.env.SHOTS) return;
  await mkdir(process.env.SHOTS, {recursive: true});
  await page.screenshot({path: `${process.env.SHOTS}/${browserName}-${name}.png`});
}

try {
  // Keep the pinned renderer identical while excluding CDN availability from this test.
  await page.route(`${THREE_CDN}**`, async route => {
    const path = route.request().url().slice(THREE_CDN.length);
    await route.fulfill({body: await readFile(new URL(`../node_modules/three/${path}`, import.meta.url)),
      contentType: 'text/javascript', headers: {'access-control-allow-origin': '*'}});
  });
  const url = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:8766/');
  url.searchParams.set('test', ''); url.searchParams.delete('menu');
  await page.goto(url.href, {waitUntil: 'domcontentloaded'});
  await wait(() => window.__mirio && !document.querySelector('#start').disabled);
  assert.ok(await page.locator('#game-logo').isVisible());
  assert.equal(await page.locator('[data-level="kart"]').isVisible(), false);
  await page.click('#start'); await wait(() => window.__mirio.snapshot().state === 'hub');
  console.log(`ok ${browserName}: normal title → hub`);

  for (const id of levelIds) {
    const chapter = CHAPTERS[id];
    await page.click('#pause-button'); await page.click('#pause-quick');
    await page.click(`[data-level="${id}"]`);
    const expectedState = id === 'adventure' ? 'play' : id === 'kart' ? 'race' : 'chapter';
    await wait(({id, expectedState}) => {
      const run = window.__mirio.snapshot();
      return run.selectedLevel === id && run.state === expectedState;
    }, {id, expectedState});
    if (id === 'kart') await wait(() => window.__mirio.snapshot().race.state === 'race');
    else if (id !== 'adventure') await wait(() => window.__mirio.snapshot().chapterRun?.countdown === 0);

    const before = await snapshot(), key = id === 'adventure' ? 'KeyW' : id === 'kart' ? 'ArrowUp' : 'ArrowRight';
    if (id === 'marble') {
      await page.keyboard.down('Space');
      await wait(() => window.__mirio.snapshot().chapterRun.plungerCharge > .7);
      await page.keyboard.up('Space');
    }
    await page.keyboard.down(key);
    await wait(({id, before}) => {
      const run = window.__mirio.snapshot();
      if (run.time <= before.time + .15) return false;
      if (id === 'adventure') return Math.hypot(...run.player.pos.map((value, i) => value - before.player.pos[i])) > .65;
      if (id === 'kart') return run.race.speed > 2 && run.race.s > before.race.s + .1;
      if (id === 'marble') return run.chapterRun.launches > 0 && run.chapterRun.y > before.chapterRun.y + 1;
      return Number.isFinite(run.chapterRun?.x) && Number.isFinite(run.chapterRun?.y)
        && run.chapterRun.x > before.chapterRun.x + .5;
    }, {id, before});
    await page.keyboard.up(key);
    const moved = await snapshot();
    assert.equal(moved.selectedLevel, id); assert.equal(moved.state, expectedState);
    assert.ok(moved.rendering.calls > 0, `${chapter.short} must render`);
    assert.deepEqual(errors, []);
    await shot(id);

    await page.click('#pause-button'); await wait(() => window.__mirio.snapshot().paused);
    const paused = await snapshot(); await frames();
    const frozen = await snapshot();
    assert.equal(frozen.time, paused.time, `${chapter.short}: pause freezes the level clock`);
    if (paused.chapterRun) assert.deepEqual(frozen.chapterRun, paused.chapterRun);
    else if (id === 'kart') assert.equal(frozen.race.s, paused.race.s);
    else assert.deepEqual(frozen.player.pos, paused.player.pos);
    await page.click('#pause-menu'); await wait(() => window.__mirio.snapshot().state === 'hub');
    const returned = await snapshot();
    assert.equal(returned.time, 0); assert.equal(returned.chapterRun, null);
    const classes = await page.locator('body').getAttribute('class');
    assert.ok(classes.includes('hub-mode'));
    assert.equal(classes.split(/\s+/).some(name => name === 'racing' || name === 'flying' || name.startsWith('chapter-')), false);
    console.log(`ok ${browserName}: ${id} movement, pause, hub return`);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${browserName}: ${levelIds.join(', ')}, no runtime errors`);
} catch (error) {
  console.error('Browser smoke failure:', error.message);
  console.error('Runtime errors:', errors);
  console.error('State:', await snapshot().catch(() => null));
  await shot('failure').catch(() => {});
  throw error;
} finally {await browser.close();}
