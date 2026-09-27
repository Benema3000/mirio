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
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/js/main.js*',async route=>{
    const response=await route.fetch();const body=(await response.text()).replace('window.__mirio = {','window.__kartRace = race; window.__kartCamera = camera; window.__mirio = {');
    await route.fulfill({response,body});
  });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route=>{
    const path=route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+path),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`${base}?test`);await wait(page,()=>window.__mirio&&!document.querySelector('#start').disabled);
  await page.click('[data-level="kart"]');await page.click('#start');
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
    Object.assign(r.rival,{v:15,charge:.4,drift:1,air:true});
    r.slide(r.rival,.02,{steer:0,drift:1},[],false);
    const airborneCharge=r.rival.charge;
    r.reset();r.skipTo(0);
    Object.assign(r.rival,{v:15,charge:1.09,drift:1});
    r.slide(r.rival,.02,{steer:0,drift:1},[],false);
    const heldMemory=r.rival.turboMemory;
    r.slide(r.rival,.01,{steer:0,drift:0},[],false);
    const releaseMemory=r.rival.turboMemory;
    r.reset();r.skipTo(0);
    Object.assign(r.player,{s:.01,v:-5});
    r.stepRacer(r.player,.1,{brake:1,steer:0,throttle:0},[],true);
    const start=r.player.s;
    r.reset();r.skipTo(0);
    r.player.x=2.2;
    return {edgeSteer,airborneCharge,heldMemory,releaseMemory,start};
  });
  assert.deepEqual({
    staysInside:review.edgeSteer<=0,
    airborneCharge:review.airborneCharge,
    heldMemory:review.heldMemory,
    earnsRelease:review.releaseMemory>0,
    start:review.start,
  },{staysInside:true,airborneCharge:.4,heldMemory:0,earnsRelease:true,start:0});
  console.log('ok rival branch boundaries, honest drift and reverse recovery');
  await page.keyboard.down('ArrowUp');await wait(page,()=>window.__kartRace.player.v>10);
  await page.keyboard.down('ArrowLeft');await page.keyboard.down('Space');
  await wait(page,()=>window.__kartRace.player.drift!==0);await page.keyboard.up('ArrowLeft');
  await wait(page,()=>window.__kartRace.player.charge>=1.1);await shot(page,'kart-orange-drift');
  await page.keyboard.up('Space');await wait(page,()=>window.__kartRace.player.turbo>0);
  assert.equal((await race(page)).bestDrift,2);await page.keyboard.up('ArrowUp');
  console.log('ok keyboard orange drift and release');

  await page.evaluate(()=>{window.__kartRace.reset();window.__kartRace.skipTo(0);window.__kartPlay={charged:false,events:[],previews:[]};});
  for(let segment=0;segment<30;segment++) {
    const result=await page.evaluate(()=>{
      const r=window.__kartRace,run=window.__kartPlay,dt=1/120;
      for(let i=0;i<240 && r.progress<.985;i++) {
        const s=r.snapshot(),k=r.player,target=s.nextFork?s.nextFork.side*2:0;
        let steer=Math.max(-1,Math.min(1,.75*s.road.curvature*k.v/2.4-k.yaw*1.5+(target-k.x)*.3));
        const prepare=s.nextFork?.turbo && s.nextFork.s-k.s>12;
        if(prepare&&!run.charged)steer=k.drift?-.26/.78:1;
        if(k.charge>1.1)run.charged=true;
        r.simulate(dt,{steer,throttle:1,brake:0,hold:prepare&&!run.charged,jump:false,spin:false},run.events);
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
  await page.evaluate(()=>{
    const r=window.__kartRace,f=r.snapshot().forks[0];r.skipTo((f.s0-1-8.5)/(r.sFinish-8.5));
    Object.assign(r.player,{x:2,turboMemory:0,v:16});r.simulate(.1,{throttle:1,steer:0},[]);r.animate(0);
  });
  assert.equal((await race(page)).route,'main');assert.equal((await race(page)).catches,1);
  console.log('ok replay reset and useful lower-road catch');

  // Standard controller signals pass through the actual Input poller.
  await page.evaluate(()=>{
    window.__kartRace.reset();window.__kartRace.skipTo(0);
    window.__pad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};
    navigator.getGamepads=()=>[window.__pad];window.__pad.buttons[7]={value:1,pressed:true};
  });
  await wait(page,()=>window.__kartRace.player.v>10);
  await page.evaluate(()=>{window.__pad.axes[0]=-.7;window.__pad.buttons[0]={value:1,pressed:true};});
  await wait(page,()=>window.__kartRace.player.drift!==0);
  await page.evaluate(()=>{window.__pad.axes[0]=.4;});
  await wait(page,()=>window.__kartRace.player.charge>=.5);
  await page.evaluate(()=>{window.__pad.buttons[0]={value:0,pressed:false};window.__pad.axes[0]=0;});
  await wait(page,()=>window.__kartRace.player.turbo>0);
  await page.evaluate(()=>{window.__pad.buttons[9]={value:1,pressed:true};});
  await wait(page,()=>window.__mirio.snapshot().paused);const paused=await race(page);
  await page.waitForTimeout(250);assert.equal((await race(page)).time,paused.time);
  console.log('ok controller drift, release and pause');await desktop.close();
  }

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const phone=await load(mobile);const client=await mobile.newCDPSession(phone);
  const center=async selector=>{const b=await phone.locator(selector).boundingBox();assert.ok(b);return{x:b.x+b.width/2,y:b.y+b.height/2};};
  const gas=await center('#btn-gas'),jump=await center('#btn-jump'),stick={x:72,y:740};
  await shot(phone,'kart-phone-layout');
  for(const point of [gas,jump,stick])assert.ok(point.x>0&&point.x<390&&point.y>0&&point.y<844);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...gas,id:1}]});
  await wait(phone,()=>window.__kartRace.player.v>10);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...jump,id:1},{...stick,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...jump,id:1},{x:stick.x-30,y:stick.y,id:2}]});
  await wait(phone,()=>window.__kartRace.player.drift!==0);
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...jump,id:1},{x:stick.x+15,y:stick.y,id:2}]});
  await wait(phone,()=>window.__kartRace.player.charge>=.5);await shot(phone,'kart-phone-drift');
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(phone,()=>window.__kartRace.player.turbo>0);
  console.log('ok two-thumb touch drift and release at 390×844');await mobile.close();
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
