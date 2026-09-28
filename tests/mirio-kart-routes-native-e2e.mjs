// Optional branching course through keyboard Input; no seek or simulation hooks.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:800,height:560},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route=>{
    const name=route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+name),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8767/'}?test&menu`);
  await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:180000});
  await page.click('[data-level="adventure"]');await page.click('#start');
  // Discovery has its own test; use the real gates to reach this race fixture.
  for (const id of ['enter','race']) {
    await page.evaluate(id=>{const gate=window.__mirio.layout().discovery.find(item=>item.id===id);window.__mirio.teleport(gate.planet,gate.dir,.15);},id);
    await page.waitForFunction(()=>window.__mirio.snapshot().player.onGround&&!document.querySelector('#discovery-action').hidden,null,{timeout:180000});
    await page.click('#discovery-action');
    await page.waitForFunction(id=>id==='enter'?window.__mirio.snapshot().discovery.onPlanet:window.__mirio.snapshot().discovery.branchRace,id,{timeout:180000});
  }
  await page.waitForFunction(()=>window.__mirio.snapshot().race.state==='race',null,{timeout:180000});
  await page.evaluate(()=>{
    const held=new Set();
    const press=(code,active)=>{
      if(held.has(code)===active)return;
      if(active)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(active?'keydown':'keyup',{code,key:code==='Space'?' ':code,bubbles:true}));
    };
    const clamp=x=>Math.max(-1,Math.min(1,x));
    const driver=window.__nativeKart={done:false,drift:'waiting',side:0,samples:[],error:null};
    let pulse=0,lastBucket=-1;
    function tick(){
      const snap=window.__mirio.snapshot(),r=snap.race;
      if(snap.state==='win'){
        for(const code of [...held])press(code,false);
        driver.done=true;driver.result=snap;return;
      }
      if(snap.state==='raceEnd'){
        for(const code of [...held])press(code,false);
        driver.finish=snap;requestAnimationFrame(tick);return;
      }
      if(snap.state!=='race'){driver.error=`unexpected state ${snap.state}`;return;}
      const target=r.nextFork ? r.nextFork.side*2 : 0;
      let steer=clamp(.75*r.road.curvature*r.speed/2.4-r.yaw*1.5+(target-r.x)*.3),hold=false;
      // Prepare on the opening bend, release before the golden wind-road fork.
      const prepare=r.nextFork?.turbo && r.nextFork.s-r.s>12;
      if(prepare && driver.drift==='waiting')driver.drift='charging';
      if(driver.drift==='charging'){
        steer=r.drift ? -.26/.78 : 1;
        hold=true;
        if(r.charge>=1.1||!prepare){hold=false;driver.drift='released';}
      }
      // Pulse ordinary left/right keys; the game's steering response smooths them.
      pulse+=steer;const turn=pulse>.5?1:pulse<-.5?-1:0;pulse-=turn;
      press('ArrowUp',true);press('ArrowLeft',turn<0);press('ArrowRight',turn>0);press('Space',hold);
      const bucket=Math.floor(r.progress*20);
      if(bucket!==lastBucket){driver.samples.push({progress:r.progress,time:snap.time,x:r.x,speed:r.speed,route:r.route});lastBucket=bucket;}
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  if(process.env.SHOTS)await mkdir(process.env.SHOTS,{recursive:true});
  const deadline=Date.now()+600000;
  let report=-1;
  while(Date.now()<deadline){
    await page.waitForTimeout(500);
    const state=await page.evaluate(()=>({done:window.__nativeKart.done,error:window.__nativeKart.error,race:window.__mirio.snapshot().race}));
    assert.equal(state.error,null);
    const bucket=Math.floor(state.race.progress*10);
    if(bucket!==report){
      console.log(`native ${bucket*10}%`);report=bucket;
      if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/native-${bucket*10}.png`});
    }
    if(state.done)break;
  }
  const result=await page.evaluate(()=>window.__nativeKart);
  assert.ok(result.done,'normal keyboard race did not finish');
  assert.equal(result.result.race.state,'finished');assert.ok(result.result.time>20);
  assert.equal(result.result.race.routeStyle,'playground');
  assert.ok(result.result.race.bestDrift>=1);
  assert.deepEqual(result.result.race.routes,['wind','orchard','cloud']);
  assert.equal(result.result.race.splits.length,2);
  assert.ok(result.result.race.bounces>=2);
  assert.deepEqual(errors,[]);
  if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/native-finish.png`});
  console.log(JSON.stringify({time:result.result.time,bestDrift:result.result.race.bestDrift,samples:result.samples,errors},null,2));
} finally {await browser.close();}
