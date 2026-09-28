// Focus on the raised toys and cabinet framing; ordinary controls have a separate full-run suite.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PerspectiveCamera, Vector3} from 'three';
import {MARBLE, flipperSegment, sampleMarblePath} from '../js/marble-rules.js';
import {COURSE, personalBestKey} from '../js/course-version.js';

const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const VIEWPORTS = [{name: 'desktop', width: 900, height: 760},
  {name: 'portrait', width: 390, height: 844}, {name: 'landscape', width: 844, height: 390}];
const FRAME = Object.freeze({edge: .98, minimumHeight: .9, minTilt: 25, maxTilt: 45});
const BUDGET = Object.freeze({calls: 200, triangles: 150000});
const TOY_PROGRESS_FOR_PAUSE = .2, SAMPLE_COUNT = 32, SETTLE_MS = 150;
const HEIGHT_TOLERANCE = 1e-9;
const ARCHIVED_TIME_MS = 61000;
const errors = [], snapshots = [];
const until = (page, predicate, argument) => page.waitForFunction(predicate, argument, {timeout: 90000});
const snapshot = page => page.evaluate(() => window.__mirio.snapshot());

async function shot(page, name) {
  if (!process.env.SHOTS) return;
  await mkdir(process.env.SHOTS, {recursive: true});
  await page.screenshot({path: `${process.env.SHOTS}/${name}.png`});
}

async function enterPinball(page) {
  await page.click('#pause-button');
  await page.click('#pause-quick');
  await page.click('[data-level="marble"]');
  await until(page, () => window.__mirio.snapshot().state === 'chapter' && window.__mirio.snapshot().chapterRun?.countdown === 0);
}

async function load(context) {
  await context.addInitScript(({key, time}) => localStorage.setItem(key, String(time)),
    {key: personalBestKey('marble', COURSE.PINBALL), time: ARCHIVED_TIME_MS});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**', async route => {
    const name = route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body: await readFile(fileURLToPath(new URL('../node_modules/three/', import.meta.url)) + name),
      contentType: 'text/javascript', headers: {'access-control-allow-origin': '*'}});
  });
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test`);
  await until(page, () => window.__mirio && !document.querySelector('#start').disabled);
  await page.click('#start');
  await until(page, () => window.__mirio.snapshot().state === 'hub');
  assert.ok((await snapshot(page)).hub.completed.includes('marble'), 'archived pinball completion retains its hub souvenir');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), personalBestKey('marble')), null,
    'the archived result must not become a current pinball best');
  await enterPinball(page);
  assert.equal(await page.locator('#chapter-best').textContent(), '', 'current HUD must exclude the archived best');
  return page;
}

function projector(view, viewport) {
  const camera = new PerspectiveCamera(view.fov, view.aspect);
  camera.position.fromArray(view.position);
  camera.quaternion.fromArray(view.quaternion);
  camera.updateMatrixWorld();
  const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const tilt = direction.angleTo(new Vector3(0, -1, 0)) * 180 / Math.PI;
  assert.ok(tilt >= FRAME.minTilt && tilt <= FRAME.maxTilt, `cabinet tilt ${tilt.toFixed(1)} degrees`);
  return point => {
    const ndc = new Vector3(point.x, point.height ?? 0, -point.y).project(camera);
    return {ndc, x: (ndc.x + 1) * viewport.width / 2, y: (1 - ndc.y) * viewport.height / 2};
  };
}

async function checkFraming(page, viewport, layout) {
  const state = await snapshot(page), project = projector(state.cameraView, viewport);
  const points = [-11.8, 14.5].flatMap(x => [0, 43].map(y => ({x, y})));
  for (const path of layout.toys.flatMap(toy => [toy.path, toy.finishPath])) {
    for (let sample = 0; sample <= SAMPLE_COUNT; sample++) {
      const point = sampleMarblePath(path, sample / SAMPLE_COUNT);
      points.push({...point, height: point.height + MARBLE.radius});
    }
  }
  const projected = points.map(project);
  for (const {ndc} of projected) {
    assert.ok(Math.abs(ndc.x) < FRAME.edge && Math.abs(ndc.y) < FRAME.edge,
      `${viewport.name} clips the playfield or a raised toy: ${ndc.toArray()}`);
  }
  const height = Math.max(...projected.map(p => p.ndc.y)) - Math.min(...projected.map(p => p.ndc.y));
  assert.ok(height >= FRAME.minimumHeight, `${viewport.name} makes the table too small (${height.toFixed(2)})`);
  assert.ok(state.rendering.calls > 0 && state.rendering.calls <= BUDGET.calls,
    `${viewport.name}: ${state.rendering.calls} draw calls exceed ${BUDGET.calls}`);
  assert.ok(state.rendering.triangles <= BUDGET.triangles,
    `${viewport.name}: ${state.rendering.triangles} triangles exceed ${BUDGET.triangles}`);

  if (viewport.name !== 'desktop') {
    for (const selector of ['#flipper-left', '#flipper-right', '#pinball-plunger']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
        `${selector} leaves ${viewport.name}`);
      for (const flipper of layout.flippers) {
        const segment = flipperSegment(flipper, MARBLE.flipperRest);
        for (const point of [{x: segment.ax, y: segment.ay}, {x: segment.bx, y: segment.by}]) {
          const screen = project(point);
          assert.ok(screen.x < box.x || screen.x > box.x + box.width || screen.y < box.y || screen.y > box.y + box.height,
            `${selector} covers a flipper on ${viewport.name}`);
        }
      }
    }
  }
  snapshots.push({viewport: viewport.name, table: state.chapterRun.table, ...state.rendering});
}

async function seek(page, target) {
  await page.evaluate(target => window.__mirio.chapterSeek(target), target);
}

async function capture(page, toy) {
  await until(page, () => window.__mirio.snapshot().chapterRun.toy.open);
  await seek(page, toy.id);
  await until(page, () => window.__mirio.snapshot().chapterRun.toy.active);
}

async function exerciseToy(page, toy, layout) {
  await seek(page, toy.table / layout.rooms.length);
  const target = layout.bells.find(bell => bell.table === toy.table);
  await seek(page, target.id);
  await until(page, id => window.__mirio.snapshot().chapterRun.noteIds.includes(id), target.id);
  await capture(page, toy);
  await until(page, progress => window.__mirio.snapshot().chapterRun.toy.progress > progress, TOY_PROGRESS_FOR_PAUSE);
  assert.ok((await snapshot(page)).chapterRun.height > 0, `${toy.id} must leave the playfield`);
  await shot(page, `cabinet-${toy.id}-ride`);
  await page.click('#pause-button');
  await until(page, () => window.__mirio.snapshot().paused);
  const paused = await snapshot(page);
  await page.waitForTimeout(SETTLE_MS);
  assert.deepEqual((await snapshot(page)).chapterRun, paused.chapterRun, `${toy.id} moves while paused`);
  await page.check('#reduced-motion');
  await page.click('#resume');
  await until(page, () => window.__mirio.snapshot().chapterRun.toy.completions > 0);
  const completed = await snapshot(page);
  assert.equal(completed.chapterRun.toy.active, false);
  assert.ok(Math.abs(completed.chapterRun.height) < HEIGHT_TOLERANCE, 'toy must return to the playfield');
  assert.ok(completed.chapterRun.notes > paused.chapterRun.notes, `${toy.id} must reward its shot`);
  assert.deepEqual(completed.cameraView, paused.cameraView, 'toy ride and reduced motion must not move the camera');

  // Recover during a second ride through the normal pause action, retaining discoveries.
  await capture(page, toy);
  await page.click('#pause-button');
  await until(page, () => window.__mirio.snapshot().paused);
  const beforeRecovery = (await snapshot(page)).chapterRun;
  await page.click('#rescue');
  await until(page, () => window.__mirio.snapshot().chapterRun.served);
  const rescued = (await snapshot(page)).chapterRun;
  assert.deepEqual(rescued.noteIds, beforeRecovery.noteIds);
  assert.equal(rescued.table, toy.table);
  assert.equal(rescued.toy.completions, beforeRecovery.toy.completions);
  assert.equal(rescued.toy.active, false);
  assert.equal(rescued.height, 0);
  assert.equal(rescued.penalty, beforeRecovery.penalty + MARBLE.recoveryPenalty);
  await page.click('#pause-button');
  await page.uncheck('#reduced-motion');
  await page.click('#resume');
  console.log(`ok ${toy.id}: raised ride, reward, frozen pause, reduced motion, persistent recovery`);
}

async function catchBall(page) {
  await seek(page, 0);
  await page.keyboard.down('ArrowLeft');
  const start = (await snapshot(page)).chapterRun.time;
  await until(page, time => window.__mirio.snapshot().chapterRun.time > time + .5, start);
  await seek(page, 'left');
  await until(page, () => window.__mirio.snapshot().chapterRun.cradled === 'left');
}

async function exerciseCradle(page) {
  await catchBall(page);
  await page.click('#pause-button');
  await until(page, () => window.__mirio.snapshot().paused);
  await page.keyboard.up('ArrowLeft');
  const paused = (await snapshot(page)).chapterRun;
  await page.waitForTimeout(SETTLE_MS);
  assert.deepEqual((await snapshot(page)).chapterRun, paused, 'pause must retain the catch');
  await page.click('#rescue');
  await until(page, () => window.__mirio.snapshot().chapterRun.served);
  assert.equal((await snapshot(page)).chapterRun.cradled, null, 'recovery must release a catch');
  await catchBall(page);
  console.log('ok catch: pause preserves the ball, recovery releases it, next catch prepares reset check');
}

try {
  const names = process.env.VIEWPORT?.split(',');
  const selected = names ? VIEWPORTS.filter(viewport => names.includes(viewport.name)) : VIEWPORTS;
  assert.ok(selected.length, 'VIEWPORT must name desktop, portrait or landscape');
  for (const viewport of process.env.ARCHIVE_ONLY ? selected.slice(0, 1) : selected) {
    const touch = viewport.name !== 'desktop';
    const context = await browser.newContext({viewport: {width: viewport.width, height: viewport.height},
      deviceScaleFactor: 1, isMobile: touch, hasTouch: touch});
    const page = await load(context);
    if (process.env.ARCHIVE_ONLY) {
      console.log('ok archived v3 pinball souvenir, empty v4 board and current HUD');
      await context.close();
      continue;
    }
    const layout = await page.evaluate(() => window.__mirio.layout().chapterCourse);
    assert.equal(layout.toys.length, layout.rooms.length);
    for (const toy of layout.toys) {
      await seek(page, toy.table / layout.rooms.length);
      await page.waitForTimeout(SETTLE_MS);
      await until(page, () => Number(getComputedStyle(document.querySelector('#toast')).opacity) === 0);
      await shot(page, `cabinet-${viewport.name}-${toy.id}`);
      await checkFraming(page, viewport, layout);
      if (!touch) await exerciseToy(page, toy, layout);
    }

    if (!touch) await exerciseCradle(page);

    await page.click('#pause-button');
    await page.keyboard.up('ArrowLeft');
    await page.click('#pause-menu');
    await until(page, () => window.__mirio.snapshot().state === 'hub');
    await page.waitForTimeout(SETTLE_MS);
    assert.equal((await snapshot(page)).state, 'hub');
    assert.equal((await snapshot(page)).time, 0);
    await enterPinball(page);
    const fresh = (await snapshot(page)).chapterRun;
    assert.equal(fresh.notes, 0);
    assert.equal(fresh.toy.completions, 0);
    assert.deepEqual(fresh.toyCompletions, layout.toys.map(() => 0));
    assert.equal(fresh.toyShots, 0);
    assert.equal(fresh.toy.active, false);
    assert.equal(fresh.table, 0);
    assert.equal(fresh.penalty, 0);
    assert.equal(fresh.height, 0);
    assert.equal(fresh.served, true);
    assert.equal(fresh.cradled, null);
    console.log(`ok ${viewport.name}: three framed cabinets, controls clear, hub return, fresh reset`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`render budgets ${JSON.stringify(snapshots)}`);
} finally {
  await browser.close();
}
