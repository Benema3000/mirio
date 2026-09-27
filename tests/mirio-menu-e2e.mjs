// Public menus use the normal hub entry, never the legacy test-menu fixture.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const names = {adventure: 'Planetenreise', kart: 'Sternenrennen', sky: 'Wolkenpost', ribbon: 'Blütenpfad', marble: 'Klangkugel'};
const errors = [];
async function load(options) {
  const context = await browser.newContext(options), page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**', async route => {
    const path = route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body: await readFile(new URL(`../node_modules/three/${path}`, import.meta.url)), contentType: 'text/javascript', headers: {'access-control-allow-origin': '*'}});
  });
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test`);
  await page.waitForFunction(() => window.__mirio && !document.querySelector('#start').disabled, null, {timeout: 120000});
  return {context, page};
}
async function pad(page, index) {
  await page.evaluate(index => {window.menuPad.buttons[index] = {pressed: true, value: 1};}, index);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(index => {window.menuPad.buttons[index] = {pressed: false, value: 0};}, index);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
try {
  const {context, page} = await load({viewport: {width: 900, height: 650}});
  assert.equal(await page.locator('[data-level="kart"]').isVisible(), false);
  await page.click('#show-times');
  assert.equal(await page.locator('[data-scores-level]').count(), 5, 'every public time board needs an independent selector');
  for (const [id, name] of Object.entries(names)) {
    await page.click(`[data-scores-level="${id}"]`);
    assert.ok((await page.locator('#title-scores-heading').textContent()).includes(name));
    assert.equal(await page.evaluate(() => window.__mirio.snapshot().state), 'title');
  }
  await page.keyboard.press('Escape'); await page.click('#show-help');
  for (const [id, name] of Object.entries(names)) {
    await page.click(`[data-help-level="${id}"]`);
    assert.ok((await page.locator('#help-title').textContent()).includes(name));
  }
  await page.evaluate(() => {
    window.menuPad = {connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 16}, () => ({pressed: false, value: 0}))};
    navigator.getGamepads = () => [window.menuPad];
  });
  await pad(page, 1);
  assert.equal(await page.locator('#help-dialog').evaluate(element => element.open), false, 'B closes help');
  await page.click('#start'); await page.waitForSelector('body.hub-mode'); await page.click('#pause-button');
  const before = await page.evaluate(() => window.__mirio.snapshot());
  await page.click('#pause-times'); await page.click('[data-scores-level="sky"]');
  await pad(page, 9);
  assert.equal(await page.evaluate(() => window.__mirio.snapshot().paused), true, 'Start never resumes behind a dialog');
  await pad(page, 1);
  assert.equal(await page.locator('#scores-dialog').evaluate(element => element.open), false);
  const after = await page.evaluate(() => window.__mirio.snapshot());
  assert.equal(after.selectedLevel, before.selectedLevel); assert.equal(after.time, before.time);
  await page.click('#pause-help'); await page.click('[data-help-level="ribbon"]'); await pad(page, 1);
  await pad(page, 9); await pad(page, 9);
  await pad(page, 13);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'music-volume', 'D-pad reaches pause settings');
  const volume = Number(await page.locator('#music-volume').inputValue());
  await pad(page, 15); assert.ok(Number(await page.locator('#music-volume').inputValue()) > volume, 'D-pad adjusts volume');
  await pad(page, 13); await pad(page, 13);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'reduced-motion');
  const quiet = await page.locator('#reduced-motion').isChecked();
  await pad(page, 0); assert.equal(await page.locator('#reduced-motion').isChecked(), !quiet, 'A toggles the focused setting');
  await pad(page, 1); assert.equal(await page.evaluate(() => window.__mirio.snapshot().paused), false, 'B returns from pause');
  await pad(page, 9);
  for (let i = 0; i < 12 && await page.evaluate(() => document.activeElement.id) !== 'pause-quick'; i++) await pad(page, 13);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pause-quick');
  await pad(page, 0); assert.equal(await page.locator('#quick-dialog').evaluate(element => element.open), true);
  await pad(page, 13);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.level), 'sky');
  await pad(page, 0);
  assert.equal(await page.evaluate(() => window.__mirio.snapshot().selectedLevel), 'sky');
  console.log('PASS five public boards/help pages, isolated clocks, controller dialogs/settings');
  await context.close();

  const phone = await load({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await phone.page.tap('#start'); await phone.page.waitForSelector('body.hub-mode'); await phone.page.tap('#pause-button');
  await phone.page.tap('#pause-times'); await phone.page.tap('[data-scores-level="marble"]');
  for (const tab of await phone.page.locator('[data-scores-level]').all()) {
    const bounds = await tab.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  }
  await phone.page.tap('[data-close="scores-dialog"]'); await phone.page.tap('#pause-help');
  await phone.page.tap('[data-help-level="sky"]'); await phone.page.tap('[data-close="help-dialog"]');
  assert.equal(await phone.page.evaluate(() => window.__mirio.snapshot().paused), true);
  console.log('PASS touch information dialogs fit and return to pause');
  await phone.context.close(); assert.deepEqual(errors, []);
} finally {await browser.close();}
