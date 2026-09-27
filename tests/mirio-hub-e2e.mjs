// Production navigation: ordinary keyboard, touch and controller inputs enter portals.
// Existing level suites use ?test&menu; this suite deliberately tests ?test alone.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PERSONAL_BEST_PREFIX} from '../js/course-version.js';

const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
const until=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:180000});
const snapshot=page=>page.evaluate(()=>window.__mirio.snapshot());
const saved={adventure:200000,sky:60000,ribbon:60000};

async function shot(page,name) {
  if(!process.env.SHOTS)return;
  await mkdir(process.env.SHOTS,{recursive:true});
  await page.screenshot({path:`${process.env.SHOTS}/${name}.png`});
}

async function load(context) {
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route=>{
    const name=route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+name),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.addInitScript(({prefix,saved})=>{
    for(const [id,time] of Object.entries(saved))localStorage.setItem(prefix+id,String(time));
  },{prefix:PERSONAL_BEST_PREFIX,saved});
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8767/'}?test`);
  await until(page,()=>window.__mirio&&!document.querySelector('#start').disabled);
  return page;
}

async function driveTo(page,target,{device='keyboard',enter=true}={}) {
  await page.evaluate(({target,device,enter})=>{
    const held=new Set(),pulse={x:0,y:0};
    const press=(code,active)=>{
      if(held.has(code)===active)return;
      if(active)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(active?'keydown':'keyup',{code,key:code,bubbles:true}));
    };
    const stop=()=>{
      for(const code of [...held])press(code,false);
      if(device==='controller')window.__hubPad.axes=[0,0,0,0];
    };
    const driver=window.__hubPilot={done:false,error:null};
    const start=performance.now();
    const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
    function tick(){
      const snap=window.__mirio.snapshot();
      if(snap.state!=='hub'){stop();driver.done=enter;driver.error=enter?null:'left hub';return;}
      const h=snap.hub,d=target.map((v,i)=>v-h.pos[i]),distance=Math.hypot(...d);
      if(!enter&&distance<1){stop();driver.done=true;return;}
      if(performance.now()-start>120000){stop();driver.error=JSON.stringify({target,hub:h});return;}
      const scale=Math.max(1,distance);
      let x=dot(d,h.right)/scale,y=dot(d,h.forward)/scale;
      if(distance<.65)x=y=0;
      if(device==='controller')window.__hubPad.axes=[x,-y,0,0];
      else {
        pulse.x+=x;pulse.y+=y;
        const dx=pulse.x>.5?1:pulse.x<-.5?-1:0,dy=pulse.y>.5?1:pulse.y<-.5?-1:0;
        pulse.x-=dx;pulse.y-=dy;
        press('ArrowLeft',dx<0);press('ArrowRight',dx>0);press('ArrowUp',dy>0);press('ArrowDown',dy<0);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },{target,device,enter});
  await until(page,()=>window.__hubPilot.done||window.__hubPilot.error);
  assert.equal(await page.evaluate(()=>window.__hubPilot.error),null);
}

async function returnFromPause(page) {
  await page.click('#pause-button');await until(page,()=>window.__mirio.snapshot().paused);
  await page.click('#pause-menu');await until(page,()=>window.__mirio.snapshot().state==='hub');
  const before=await snapshot(page);
  await until(page,t=>window.__mirio.snapshot().hub.time>t+.7,before.hub.time);
  assert.equal((await snapshot(page)).state,'hub','return must not reopen the portal');
  assert.equal((await snapshot(page)).time,0,'hub never advances a level clock');
}

async function touchPortal(page,client,target) {
  const origin={x:72,y:730},deadline=Date.now()+120000;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...origin,id:1}]});
  while(Date.now()<deadline) {
    const state=await snapshot(page);
    if(state.state!=='hub') {
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      return;
    }
    const hub=state.hub,d=target.map((v,i)=>v-hub.pos[i]),distance=Math.hypot(...d);
    const dot=axis=>d.reduce((sum,v,i)=>sum+v*axis[i],0)/Math.max(1,distance);
    const x=distance<.65?0:dot(hub.right),y=distance<.65?0:dot(hub.forward);
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x+x*42,y:origin.y-y*42,id:1}]});
    await page.waitForTimeout(80);
  }
  throw new Error('touch did not reach the portal');
}

try {
  const desktop=await browser.newContext({viewport:{width:900,height:650},deviceScaleFactor:1});
  const page=await load(desktop);
  assert.ok(await page.locator('#game-logo').isVisible());
  assert.equal(await page.locator('[data-level="kart"]').isVisible(),false);
  await shot(page,'hub-title');
  await page.click('#start');await until(page,()=>window.__mirio.snapshot().state==='hub');
  assert.deepEqual((await snapshot(page)).hub.completed.sort(),Object.keys(saved).sort());
  assert.equal((await snapshot(page)).hub.completed.includes('kart'),false);
  await page.click('#pause-button');await page.click('#pause-quick');
  await page.evaluate(()=>{
    window.__hubPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};
    navigator.getGamepads=()=>[window.__hubPad];
    window.__hubPad.buttons[9]={value:1,pressed:true};
  });
  await page.waitForTimeout(400);
  assert.equal((await snapshot(page)).paused,true,'controller Start must not resume behind an open dialog');
  await page.evaluate(()=>{window.__hubPad.buttons[9]={value:0,pressed:false};});
  await page.click('[data-close="quick-dialog"]');await page.click('#resume');
  console.log('ok controller Start respects modal pause');
  await shot(page,'hub-arrival');
  const layout=await page.evaluate(()=>window.__mirio.layout().hub);
  for(const portal of layout.portals) {
    const id=portal.level;
    await driveTo(page,portal.pos);
    const state=await snapshot(page);
    assert.equal(state.selectedLevel,id);
    assert.equal(state.state,id==='adventure'?'play':id==='kart'?'race':'chapter');
    assert.ok(state.time<1,'portal starts a fresh level clock');
    await shot(page,`hub-enter-${id}`);
    await returnFromPause(page);
    console.log(`ok keyboard portal ${id}, fresh clock and locked return`);
  }
  // Finish only the last metres: race completion/replay are already driven end-to-end elsewhere.
  // A deliberate immediate walk back through the same gate starts another run.
  await driveTo(page,layout.portals.find(p=>p.level==='kart').pos);
  await until(page,()=>window.__mirio.snapshot().race.state==='race');
  await page.evaluate(()=>window.__mirio.raceSkip(.995));
  await page.keyboard.down('ArrowUp');await until(page,()=>window.__mirio.snapshot().state==='win');await page.keyboard.up('ArrowUp');
  await page.click('#again');await until(page,()=>window.__mirio.snapshot().state==='race');
  assert.equal((await snapshot(page)).selectedLevel,'kart');
  await until(page,()=>window.__mirio.snapshot().race.state==='race');
  await page.evaluate(()=>window.__mirio.raceSkip(.995));
  await page.keyboard.down('ArrowUp');await until(page,()=>window.__mirio.snapshot().state==='win');await page.keyboard.up('ArrowUp');
  await page.click('#win-menu');await until(page,()=>window.__mirio.snapshot().state==='hub');
  assert.ok((await snapshot(page)).hub.completed.includes('kart'));
  const bests=await page.evaluate(prefix=>Object.fromEntries(['adventure','sky','ribbon','kart'].map(id=>[id,Number(localStorage.getItem(prefix+id))])),PERSONAL_BEST_PREFIX);
  for(const id of ['adventure','sky','ribbon'])assert.equal(bests[id],saved[id]);
  assert.ok(Number.isSafeInteger(bests.kart)&&bests.kart>0);
  console.log('ok result return, same-level replay and separate personal records');

  await page.evaluate(()=>{
    window.__hubPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};
    navigator.getGamepads=()=>[window.__hubPad];
  });
  const pad=async(index,pressed)=>page.evaluate(({index,pressed})=>{window.__hubPad.buttons[index]={value:pressed?1:0,pressed};},{index,pressed});
  await pad(9,true);await until(page,()=>window.__mirio.snapshot().paused);await pad(9,false);
  const paused=await snapshot(page);await page.waitForTimeout(200);
  assert.deepEqual((await snapshot(page)).hub.pos,paused.hub.pos);
  await page.check('#reduced-motion');assert.equal(await page.evaluate(()=>localStorage.getItem('mirio-motion')),'quiet');
  await pad(1,true);await until(page,()=>!window.__mirio.snapshot().paused);await pad(1,false);
  await driveTo(page,layout.portals.find(p=>p.level==='ribbon').pos,{device:'controller'});
  assert.equal((await snapshot(page)).selectedLevel,'ribbon');
  await pad(9,true);await until(page,()=>window.__mirio.snapshot().paused);await pad(9,false);
  await pad(2,true);await until(page,()=>window.__mirio.snapshot().state==='hub');await pad(2,false);
  console.log('ok controller travel, pause/resume, return and reduced motion');
  await page.reload();await until(page,()=>window.__mirio&&!document.querySelector('#start').disabled);
  await page.click('#start');await until(page,()=>window.__mirio.snapshot().state==='hub');
  assert.ok((await snapshot(page)).hub.completed.includes('kart'),'earned portal medal survives reload');
  console.log('ok earned portal medal survives reload');
  await desktop.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const phone=await load(mobile);await phone.tap('#start');await until(phone,()=>window.__mirio.snapshot().state==='hub');
  assert.ok(await phone.locator('#btn-pound').isVisible(),'touch must expose the flower spring action');
  const client=await mobile.newCDPSession(phone),stick={x:72,y:730};
  const initial=await snapshot(phone);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x,y:stick.y-35,id:1}]});
  await until(phone,pos=>Math.hypot(...window.__mirio.snapshot().hub.pos.map((v,i)=>v-pos[i]))>2,initial.hub.pos);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await phone.tap('#btn-jump');await until(phone,()=>!window.__mirio.snapshot().hub.grounded);
  await phone.tap('#pause-button');await until(phone,()=>window.__mirio.snapshot().paused);
  await phone.tap('#resume');await until(phone,()=>!window.__mirio.snapshot().paused);
  for(const selector of ['#journey','#btn-jump','#btn-spin','#pause-button']) {
    const box=await phone.locator(selector).boundingBox();
    assert.ok(box&&box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844,`${selector} leaves phone viewport`);
  }
  await shot(phone,'hub-phone');
  for(const level of ['sky','tilt']) {
    const portal=await phone.evaluate(level=>window.__mirio.layout().hub.portals.find(p=>p.level===level).pos,level);
    await touchPortal(phone,client,portal);
    assert.equal((await snapshot(phone)).selectedLevel,level);
    await returnFromPause(phone);
  }
  // The accessibility route chooser is explicit; the normal start remains the garden.
  await phone.tap('#pause-button');await phone.tap('#pause-quick');
  await phone.tap('[data-level="ribbon"]');await until(phone,()=>window.__mirio.snapshot().state==='chapter');
  assert.equal((await snapshot(phone)).selectedLevel,'ribbon');
  console.log('ok touch portal/walk/jump/pause, phone layout and explicit quick choice');
  await mobile.close();
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
