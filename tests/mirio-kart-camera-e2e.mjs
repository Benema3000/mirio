// Exercise the actual chase camera with fixed kart poses, independent of frame rate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const VECTOR_TOLERANCE = 1e-12;
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function verifyStyle(routeStyle) {
  const page = await browser.newPage({viewport:{width:800,height:560}});
  const errors = []; page.on('pageerror',error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/js/kart.js*',async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('routeStyle = RACE_STYLE.CLASSIC',`routeStyle = '${routeStyle}'`);
    await route.fulfill({response,body});
  });
  await page.route('**/js/main.js*',async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('window.__mirio = {','window.__kartRace = race; window.__kartCamera = camera; window.__mirio = {');
    await route.fulfill({response,body});
  });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route => {
    const name = route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+name),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test&menu`);
  await page.waitForFunction(() => window.__kartRace && !document.querySelector('#start').disabled,null,{timeout:180000});
  const camera = await page.evaluate(() => {
    const race = window.__kartRace, camera = window.__kartCamera;
    race.reset(); race.skipTo(.18);
    const fork = race.snapshot().forks[0];
    if (fork) Object.assign(race.player,{route:fork.id,s:(fork.s0+fork.s1)/2});
    Object.assign(race.player,{course:.6,boost:0,v:30}); race.animate(0);
    function pose({reducedMotion, boost}) {
      race.player.boost = boost; race.cam.fresh = true; race.cam.kick = 0;
      race.updateCamera(camera,1/60,{reducedMotion});
      return {offset:race.cam.offset.toArray(),up:race.cam.up.toArray(),kick:race.fovKick};
    }
    const calm = pose({reducedMotion:true,boost:0}), calmBoost = pose({reducedMotion:true,boost:1}), moving = pose({reducedMotion:false,boost:1});
    const levelUp = race.track.levelUp(race.player.s,race.cam.up.clone()).toArray();
    return {calm,calmBoost,moving,levelUp};
  });
  assert.deepEqual(camera.calmBoost.offset,camera.calm.offset,'reduced motion removes boost camera pull');
  assert.ok(Math.hypot(...camera.calm.up.map((value,index) => value-camera.levelUp[index])) < VECTOR_TOLERANCE,'reduced motion keeps horizon level');
  assert.equal(camera.calmBoost.kick,0,'reduced motion removes speed and boost zoom');
  assert.notDeepEqual(camera.moving.offset,camera.calm.offset,'ordinary camera retains speed feedback');
  assert.deepEqual(errors,[]);
  console.log(`ok ${routeStyle} kart reduced-motion banking, chase and zoom`);
  await page.close();
}
try {
  for (const routeStyle of ['classic','playground']) await verifyStyle(routeStyle);
} finally { await browser.close(); }
