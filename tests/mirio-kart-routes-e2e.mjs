// Browser play: real keyboard, controller and touch inputs, then every metre of
// all forks through production physics. Only browser responses expose the race.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const base=process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
const wait=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:180000});
const race=page=>page.evaluate(()=>({state:window.__kartRace.state,time:window.__kartRace.raceTime,...window.__kartRace.snapshot()}));
async function shot(page,name) {
  if(!process.env.SHOTS)return;
  await mkdir(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${name}.png`});
}
async function load(context) {
  const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.route('**/js/main.js*',async route=>{
    const response=await route.fetch();const body=(await response.text()).replace('window.__mirio = {','Object.defineProperty(window, "__kartRace", {get:()=>race}); window.__kartCamera = camera; window.__mirio = {');
    await route.fulfill({response,body});
  });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route=>{
    const path=route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+path),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`${base}?test&menu`);await wait(page,()=>window.__mirio&&!document.querySelector('#start').disabled);
  await page.click('[data-level="adventure"]');await page.click('#start');
  // Isolate the course via its real warp; traversal below uses ordinary controls.
  for (const id of ['enter','race']) {
    await page.evaluate(id=>{const gate=window.__mirio.layout().discovery.find(item=>item.id===id);window.__mirio.teleport(gate.planet,gate.dir,.15);},id);
    await wait(page,()=>window.__mirio.snapshot().player.onGround&&!document.querySelector('#discovery-action').hidden);
    await page.click('#discovery-action');
    await wait(page,id=>id==='enter'?window.__mirio.snapshot().discovery.onPlanet:window.__mirio.snapshot().discovery.branchRace,id);
  }
  await wait(page,()=>window.__kartRace.state==='race');return page;
}
try {
  if (!process.env.TOUCH_ONLY) {
  const desktop=await browser.newContext({viewport:{width:800,height:560},deviceScaleFactor:1});
  const page=await load(desktop);
  const review=await page.evaluate(()=>{
    const r=window.__kartRace, fork=r.snapshot().forks.find(f=>f.id==='orchard');
    const limit=3.7-1.05-.34*.5;
    Object.assign(r.player,{s:(fork.s0+fork.s1)/2,x:0,route:'orchard'});
    Object.assign(r.rival,{s:r.player.s,x:limit,vx:0,route:'orchard'});
    const edgeSteer=r.aiControl(r.rival).steer;
    r.reset();r.skipTo(0);
    Object.assign(r.player,{s:.01,v:-5});
    r.stepRacer(r.player,.1,{brake:1,steer:0,throttle:0},[],true);
    const start=r.player.s;
    r.reset();r.skipTo(0);
    r.player.x=2.2;
    return {edgeSteer,start};
  });
  assert.equal(review.start,0,'braking backwards past the start clamps to the grid');
  assert.ok(review.edgeSteer<=0,'the rival must not steer over the branch edge');
  console.log('ok rival branch boundaries and reverse recovery');
  await page.keyboard.down('ArrowUp');await wait(page,()=>window.__kartRace.player.v>10);
  await page.keyboard.down('Space');await wait(page,()=>window.__kartRace.player.air===true);
  await shot(page,'kart-hop');
  await page.keyboard.up('Space');await wait(page,()=>window.__kartRace.player.air===false);
  await page.keyboard.up('ArrowUp');
  console.log('ok keyboard hop and landing');

  await page.evaluate(()=>{window.__kartRace.reset();window.__kartRace.skipTo(0);window.__kartPlay={events:[],previews:[]};});
  for(let segment=0;segment<30;segment++) {
    const result=await page.evaluate(()=>{
      const r=window.__kartRace,run=window.__kartPlay,dt=1/120;
      for(let i=0;i<240 && r.progress<.985;i++) {
        const s=r.snapshot(),k=r.player,target=s.nextFork?s.nextFork.side*2:0;
        let steer=Math.max(-1,Math.min(1,.75*s.road.curvature*k.v/2.4-k.yaw*1.5+(target-k.x)*.3));
        r.simulate(dt,{steer,throttle:1,brake:0,jump:false,spin:false},run.events);
        r.animate(dt);r.updateCamera(window.__kartCamera,dt);
        const upcoming=r.snapshot().nextFork;
        if(upcoming && upcoming.s-r.player.s<18 && !run.previews.includes(upcoming.id)) {
          run.preview=upcoming.id;run.previews.push(upcoming.id);break;
        }
      }
      const preview=run.preview;run.preview=null;
      return {progress:r.progress,preview,...r.snapshot()};
    });
    if(result.preview)await shot(page,`kart-fork-${result.preview}`);
    if(result.route!=='main')await shot(page,`kart-${result.route}`);
    if(result.progress>=.985)break;
  }
  await page.keyboard.down('ArrowUp');await wait(page,()=>window.__mirio.snapshot().state==='win');await page.keyboard.up('ArrowUp');
  const completed=await race(page);
  assert.deepEqual(completed.routes,['wind','orchard','cloud']);assert.equal(completed.splits.length,2);
  assert.ok(completed.bounces>=2);assert.equal(completed.state,'finished');
  await shot(page,'kart-branches-finish');console.log(`ok all branches, splits and toy bounces; finish ${completed.time.toFixed(2)}s`);
  await page.click('#again');await wait(page,()=>window.__kartRace.state==='race');
  assert.deepEqual((await race(page)).routes,[]);assert.deepEqual((await race(page)).splits,[]);
  // Mid-road the kart misses the entrance; over on the fork's side it joins.
  await page.evaluate(()=>{
    const r=window.__kartRace,f=r.snapshot().forks[0];r.skipTo((f.s0-1-8.5)/(r.sFinish-8.5));
    Object.assign(r.player,{x:0,v:16});r.simulate(.1,{throttle:1,steer:0},[]);r.animate(0);
  });
  assert.equal((await race(page)).route,'main');
  await page.evaluate(()=>{
    const r=window.__kartRace,f=r.snapshot().forks[0];r.skipTo((f.s0-1-8.5)/(r.sFinish-8.5));
    Object.assign(r.player,{x:2,v:16});r.simulate(.1,{throttle:1,steer:0},[]);r.animate(0);
  });
  assert.equal((await race(page)).route,'wind');
  console.log('ok replay reset and open fork entry');

  // Standard controller signals pass through the actual Input poller.
  await page.evaluate(()=>{
    window.__kartRace.reset();window.__kartRace.skipTo(0);
    window.__pad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};
    navigator.getGamepads=()=>[window.__pad];window.__pad.buttons[7]={value:1,pressed:true};
  });
  await wait(page,()=>window.__kartRace.player.v>10);
  await page.evaluate(()=>{window.__pad.axes[0]=-.7;});
  await wait(page,()=>window.__kartRace.player.x<-0.3);
  await page.evaluate(()=>{window.__pad.buttons[0]={value:1,pressed:true};});
  await wait(page,()=>window.__kartRace.player.air===true);
  await page.evaluate(()=>{window.__pad.buttons[0]={value:0,pressed:false};window.__pad.axes[0]=0;});
  await wait(page,()=>window.__kartRace.player.air===false);
  await page.evaluate(()=>{window.__pad.buttons[9]={value:1,pressed:true};});
  await wait(page,()=>window.__mirio.snapshot().paused);const paused=await race(page);
  await page.waitForTimeout(250);assert.equal((await race(page)).time,paused.time);
  console.log('ok controller steer, hop and pause');await desktop.close();
  }

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const phone=await load(mobile);const client=await mobile.newCDPSession(phone);
  const center=async selector=>{const b=await phone.locator(selector).boundingBox();assert.ok(b);return{x:b.x+b.width/2,y:b.y+b.height/2};};
  const gas=await center('#btn-gas'),brake=await center('#btn-brake'),tap={x:80,y:500};
  await shot(phone,'kart-phone-layout');
  for(const point of [gas,brake,tap])assert.ok(point.x>0&&point.x<390&&point.y>0&&point.y<844);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...gas,id:1}]});
  await wait(phone,()=>window.__kartRace.player.v>10);
  // While the right thumb holds gas, a quick tap on the left half hops.
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...gas,id:1},{...tap,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...gas,id:1}]});
  await wait(phone,()=>window.__kartRace.player.air===true);await shot(phone,'kart-phone-hop');
  await wait(phone,()=>window.__kartRace.player.air===false);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  console.log('ok gas held on the right, left-half tap hops at 390×844');
  // Layout fixture only: the real tap hop is verified above.
  await phone.evaluate(()=>{
    const r=window.__kartRace;
    r.skipTo((65-8.5)/(r.sFinish-8.5));
    Object.assign(r.player,{x:0,v:15,vx:0,steer:0,boost:1.3});
  });
  await wait(phone,()=>!document.querySelector('#race-route')?.hidden&&!document.querySelector('#race-technique').hidden);
  assert.ok(await phone.locator('#race-route').isVisible());
  assert.ok(await phone.locator('#race-technique').isVisible());
  for(const selector of ['#race-route','#race-technique','#btn-gas','#btn-brake','#btn-jump']) {
    const box=await phone.locator(selector).boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844,`${selector} leaves phone viewport`);
  }
  await shot(phone,'kart-phone-fork-boost');
  console.log('ok fork guidance remains visible beside boost on phone');await mobile.close();
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
