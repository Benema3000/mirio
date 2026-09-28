// Gate/replay/return integration. Track traversal is covered by the native race test.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait = (page, fn, arg) => page.waitForFunction(fn,arg,{timeout:180000});
const snapshot = page => page.evaluate(() => window.__mirio.snapshot());
const tokenDelivery = process.env.DELAY_TOKEN === '1' ? 'delayed' : 'immediate';
let heldAdventureResponse = null;
try {
  const page = await browser.newPage({viewport:{width:900,height:650}});
  const errors = [], submissions = [], failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  page.on('pageerror',error => { errors.push(error.message); console.error(error.message); });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route => {
    const name = route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+name),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  // Read closure state only: all transitions still use normal buttons and gates.
  await page.route('**/js/main.js*',async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('window.__mirio = {',`window.__discoveryRead = () => ({token:runToken, clock:stats.time, raceClock:race.raceTime,
      checkpoint:{planet:player.checkpoint.planet.id,dir:player.checkpoint.dir.toArray()}, result:finishedRun}); window.__mirio = {`);
    await route.fulfill({response,body});
  });
  let serial = 0;
  await page.route('**/api/times.php*',async route => {
    const query = new URL(route.request().url()).searchParams, course = query.get('course');
    let body;
    if (route.request().method() === 'POST') {
      const submitted = route.request().postDataJSON(); submissions.push({course,...submitted});
      body = {ok:true,course,level:submitted.level,top:[],rank:1};
    } else {
      body = {ok:true,course,level:query.get('level'),top:[],token:`fixture-${course}-${++serial}`};
      if (tokenDelivery === 'delayed' && !heldAdventureResponse && course === 'discovery-v3'
        && await page.evaluate(() => window.__mirio?.snapshot().state === 'play')) {
        const pending = new Promise(resolve => { heldAdventureResponse = {token:body.token,release:resolve}; });
        await pending;
      }
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.addInitScript(() => {
    localStorage.setItem('mirio-time-best:classic-v3:kart','54321');
    localStorage.setItem('mirio-time-best-v2:kart','65432');
  });
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test&menu`);
  await wait(page,() => window.__mirio && !document.querySelector('#start').disabled);
  await page.click('[data-level="adventure"]'); await page.click('#start');
  await wait(page,delivery => window.__mirio.snapshot().state === 'play' && (delivery === 'delayed' || window.__discoveryRead().token),tokenDelivery);
  console.log('discovery: adventure started');
  const layout = await page.evaluate(() => window.__mirio.layout());
  async function teleport(point) {
    await page.evaluate(point => window.__mirio.teleport(point.planet,point.dir,.15),point);
    await wait(page,() => window.__mirio.snapshot().player.onGround);
  }
  async function gate(id) {
    await teleport(layout.discovery.find(item => item.id === id));
    await wait(page,() => !document.querySelector('#discovery-action').hidden);
    await page.keyboard.press('ShiftLeft');
  }
  await teleport(layout.flags[0]);
  await wait(page,() => window.__mirio.snapshot().flags > 0);
  const meadowCheckpoint = (await page.evaluate(() => window.__discoveryRead())).checkpoint;
  let adventureToken = (await page.evaluate(() => window.__discoveryRead())).token;
  if (tokenDelivery === 'delayed') assert.equal(adventureToken,null,'fixture must defer the active adventure token');
  await gate('enter');
  await wait(page,() => window.__mirio.snapshot().discovery.onPlanet);
  assert.equal((await snapshot(page)).discovery.discovered,true);
  console.log('discovery: entered planet');
  const trail = layout.bonus.trails[0];
  for (const [index,dir] of trail.dirs.entries()) {
    await teleport({planet:trail.planet,dir});
    await wait(page,index => window.__mirio.snapshot().bonus.adventure.trails[0].next > index,index);
  }
  await teleport(layout.flags.filter(item => item.planet === 'wunderwiese').at(-1));
  const before = await snapshot(page);
  const bonusCheckpoint = (await page.evaluate(() => window.__discoveryRead())).checkpoint;
  assert.deepEqual(before.bonus.adventure.badges,['meadow']);
  console.log('discovery: badge and checkpoint earned');
  await gate('race');
  await wait(page,() => window.__mirio.snapshot().discovery.branchRace);
  check(await page.locator('#race-hud').isVisible(),'branch warp must show race HUD');
  await wait(page,() => window.__mirio.snapshot().race.state === 'race');
  assert.equal((await snapshot(page)).race.routeStyle,'playground');
  console.log('discovery: branch warp',failures);
  const entryAdventureTime = before.time;
  await page.evaluate(() => window.__mirio.raceSkip(.97));
  await page.keyboard.down('ArrowUp');
  await wait(page,() => window.__mirio.snapshot().state === 'win');
  await page.keyboard.up('ArrowUp');
  console.log('discovery: first finish');
  const first = await page.evaluate(() => window.__discoveryRead());
  assert.equal(first.result.course,'branches-v3');
  await page.locator('#score-name').fill('Tester');
  await page.click('#score-send');
  await wait(page,() => document.querySelector('#score-form').hidden);
  await page.click('#again');
  await wait(page,() => window.__mirio.snapshot().race.state === 'race');
  await page.evaluate(() => window.__mirio.raceSkip(.97));
  await page.keyboard.down('ArrowUp');
  await wait(page,() => window.__mirio.snapshot().state === 'win');
  await page.keyboard.up('ArrowUp');
  console.log('discovery: replay finish');
  const second = await page.evaluate(() => window.__discoveryRead());
  // Result browsing must not count as playing; the race animator keeps running.
  await wait(page,start => window.__discoveryRead().raceClock > start + 3,second.raceClock);
  await page.click('#win-bonus-return');
  await wait(page,() => window.__mirio.snapshot().state === 'play');
  const returned = await snapshot(page), restored = await page.evaluate(() => window.__discoveryRead());
  assert.equal(returned.selectedLevel,'adventure');
  assert.equal(returned.race.routeStyle,'classic');
  assert.equal(returned.discovery.branchRace,false);
  assert.deepEqual(returned.bonus.adventure.badges,before.bonus.adventure.badges);
  assert.equal(returned.flags,before.flags);
  assert.deepEqual(restored.checkpoint,bonusCheckpoint);
  assert.equal(restored.token,adventureToken);
  if (tokenDelivery === 'delayed') {
    assert.ok(heldAdventureResponse,'initial adventure response was held');
    adventureToken = heldAdventureResponse.token;
    const delivered = page.waitForResponse(response => response.url().includes('api/times.php?course=discovery-v3'));
    heldAdventureResponse.release();
    await (await delivered).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await page.evaluate(() => window.__discoveryRead())).token,adventureToken,
      'an adventure token arriving after detour return must remain usable');
  }
  const expectedClock = entryAdventureTime + first.clock + second.clock;
  check(Math.abs(returned.time-expectedClock) < 1.5,
    `adventure clock must retain both races and exclude result browsing: expected~${expectedClock}, actual${returned.time}`);
  console.log('discovery: adventure restored',failures);
  await page.keyboard.press('Escape'); await page.click('#rescue');
  await wait(page,() => !window.__mirio.snapshot().paused);
  assert.deepEqual((await snapshot(page)).bonus.adventure.badges,['meadow']);
  await gate('race');
  await wait(page,() => window.__mirio.snapshot().race.state === 'race');
  await page.keyboard.press('Escape');
  await wait(page,() => window.__mirio.snapshot().paused);
  await page.click('#bonus-return');
  await wait(page,() => window.__mirio.snapshot().state === 'play');
  assert.equal((await snapshot(page)).paused,false);
  assert.equal((await page.evaluate(() => window.__discoveryRead())).token,adventureToken);
  assert.deepEqual((await page.evaluate(() => window.__discoveryRead())).checkpoint,bonusCheckpoint);
  await gate('exit');
  await wait(page,() => window.__mirio.snapshot().player.planet === 'welt');
  assert.deepEqual((await page.evaluate(() => window.__discoveryRead())).checkpoint,meadowCheckpoint);
  await page.evaluate(() => window.__mirio.raceNow());
  await wait(page,() => window.__mirio.snapshot().race.state === 'race');
  assert.equal((await snapshot(page)).race.routeStyle,'classic');
  await page.evaluate(() => window.__mirio.raceSkip(.97));
  await page.keyboard.down('ArrowUp');
  await wait(page,() => window.__mirio.snapshot().state === 'win');
  await page.keyboard.up('ArrowUp');
  assert.equal((await page.evaluate(() => window.__discoveryRead())).result.course,'discovery-v3');
  await page.locator('#score-name').fill('Tester'); await page.click('#score-send');
  await wait(page,() => document.querySelector('#score-form').hidden);
  assert.deepEqual(submissions.map(item => item.course),['branches-v3','discovery-v3']);
  assert.equal(submissions[1].token,adventureToken);
  const records = await page.evaluate(() => ({classic:localStorage.getItem('mirio-time-best:classic-v3:kart'),legacy:localStorage.getItem('mirio-time-best-v2:kart'),branch:localStorage.getItem('mirio-time-best:branches-v3:kart')}));
  assert.equal(records.classic,'54321'); assert.equal(records.legacy,'65432'); assert.ok(Number(records.branch)>0);
  assert.deepEqual(errors,[]);
  assert.deepEqual(failures,[]);
  console.log('ok discovery gates, race replay/return, retained rewards/checkpoints/token, isolated records');
} finally { heldAdventureResponse?.release(); await browser.close(); }
