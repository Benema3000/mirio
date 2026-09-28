// Full board through ordinary keyboard Input; alternate bank, gutter and device controls.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],wait=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:180000});
const snap=page=>page.evaluate(()=>window.__mirio.snapshot());
const course=[[0,18],[-10,18],[-18,29],[-20,30,'rose'],[-18,38],[-18,43],[0,54],[0,57,'gold'],
  [0,54],[18,43],[18,35],[18,29],[20,30,'blue'],[18,29],[10,18],[0,18],[0,4]];
async function shot(page,name){if(!process.env.SHOTS)return;await mkdir(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${name}.png`});}
async function load(context){
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route=>{
    const name=route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+name),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8767/'}?test&menu`);
  await wait(page,()=>window.__mirio&&!document.querySelector('#start').disabled);
  await page.click('[data-level="marble"]');await page.click('#start');
  await wait(page,()=>window.__mirio.snapshot().chapterRun?.countdown===0);return page;
}
async function drive(page,route){
  await page.evaluate(route=>{
    const held=new Set(),pulse={x:0,y:0},clamp=n=>Math.max(-1,Math.min(1,n));
    const press=(code,active)=>{
      if(held.has(code)===active)return;active?held.add(code):held.delete(code);
      window.dispatchEvent(new KeyboardEvent(active?'keydown':'keyup',{code,key:code,bubbles:true}));
    };
    const stop=()=>{for(const code of [...held])press(code,false);};
    const pilot=window.__marblePilot={index:0,done:false,error:null,shots:[],snapshot:null};
    let since=0,lastIndex=-1;
    function tick(){
      const state=window.__mirio.snapshot(),r=state.chapterRun;
      if(state.state==='win'){stop();pilot.done=true;pilot.snapshot=r;return;}
      if(pilot.index>=route.length){stop();pilot.done=true;pilot.snapshot=r;return;}
      if(state.state!=='chapter'){stop();pilot.error=`unexpected ${state.state}`;return;}
      if(pilot.index!==lastIndex){lastIndex=pilot.index;since=r.time;}
      if(r.time-since>28){stop();pilot.error=JSON.stringify({target:route[pilot.index],run:r});return;}
      const [tx,ty,bell]=route[pilot.index],dx=tx-r.x,dy=ty-r.y,distance=Math.hypot(dx,dy);
      if(distance<.6&&r.speed<1&&(!bell||r.noteIds.includes(bell))){pilot.index++;requestAnimationFrame(tick);return;}
      const wanted=Math.min(4.6,distance*2),scale=wanted/Math.max(.1,distance);
      // Wanted push on the board, turned into the camera's frame (the stick is camera-relative).
      const bx=clamp((dx*scale-r.vx)*.55),by=clamp((dy*scale-r.vy)*.55),h=r.heading??0;
      const x=clamp(bx*Math.cos(h)-by*Math.sin(h)),y=clamp(bx*Math.sin(h)+by*Math.cos(h));
      pulse.x+=x;pulse.y+=y;
      const turnX=pulse.x>.5?1:pulse.x<-.5?-1:0,turnY=pulse.y>.5?1:pulse.y<-.5?-1:0;
      pulse.x-=turnX;pulse.y-=turnY;
      press('ArrowLeft',turnX<0);press('ArrowRight',turnX>0);press('ArrowUp',turnY>0);press('ArrowDown',turnY<0);
      press('Space',distance<1.3&&r.speed>1.4||Boolean(bell&&r.notesNear===bell&&distance<1.8));
      press('ShiftLeft',Boolean(bell&&r.noteReady&&r.cooldown===0));
      for(const id of r.noteIds)if(!pilot.shots.includes(id))pilot.shots.push(id);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },route);
  let reported=-1,lastNote=0;const deadline=Date.now()+600000;
  while(Date.now()<deadline){
    await page.waitForTimeout(400);const result=await page.evaluate(()=>window.__marblePilot);
    assert.equal(result.error,null);
    if(Math.floor(result.index/4)!==reported){reported=Math.floor(result.index/4);console.log(`marble route ${result.index}/${route.length}`);}
    if(result.shots.length>lastNote){lastNote=result.shots.length;await shot(page,`marble-${result.shots.at(-1)}`);}
    if(result.done)return result.snapshot;
  }
  assert.fail('marble keyboard route timed out');
}
try{
  if(process.env.WIN_KEYS_ONLY){
    const context=await browser.newContext({viewport:{width:900,height:650}}),page=await load(context);
    // Trusted key repeat must not arm the newly focused replay button.
    await page.keyboard.down('Space');await page.evaluate(()=>window.__mirio.chapterSeek(.99));
    await wait(page,()=>window.__mirio.snapshot().state==='win');
    await page.keyboard.down('Space');await page.keyboard.up('Space');await page.waitForTimeout(250);
    assert.equal((await snap(page)).state,'win','held brake must not replay on release');
    await page.keyboard.press('Space');await wait(page,()=>window.__mirio.snapshot().state==='chapter');
    console.log('ok held brake stays on result; a fresh Space replays');await context.close();
  }else{
  if(!process.env.TOUCH_ONLY){
  const desktop=await browser.newContext({viewport:{width:900,height:650},deviceScaleFactor:1}),page=await load(desktop);
  await shot(page,'marble-start');await drive(page,course);
  if((await snap(page)).state!=='win'){
    await page.keyboard.down('Space');await wait(page,()=>window.__mirio.snapshot().state==='win');await page.keyboard.up('Space');
  }
  const finish=await snap(page);assert.equal(finish.selectedLevel,'marble');assert.equal(finish.chapterRun.notes,3);
  assert.equal(finish.chapterRun.recoveries,0);assert.ok(finish.time>35&&finish.time<100);
  await shot(page,'marble-finish');console.log(`ok full keyboard board ${finish.time.toFixed(2)}s; notes3, no rescues`);
  await page.click('#again');await wait(page,()=>window.__mirio.snapshot().chapterRun?.countdown===0);
  assert.equal((await snap(page)).chapterRun.notes,0);
  await drive(page,[[0,18],[-2,30],[2,42],[0,54],[0,57,'gold']]);
  assert.ok((await snap(page)).chapterRun.bankTrips>0);await shot(page,'marble-bank');
  const before=(await snap(page)).chapterRun;
  // Roll off the board's right-hand side: the stick is camera-relative, so turn board right into keys each frame.
  await page.evaluate(n=>{
    const held=new Set(),press=(code,on)=>{if(held.has(code)===on)return;on?held.add(code):held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));};
    (function tick(){
      const r=window.__mirio.snapshot().chapterRun,h=r.heading??0;
      if(r.recoveries>n){for(const code of [...held])press(code,false);return;}
      const x=Math.cos(h),y=Math.sin(h);
      press('ArrowRight',x>.35);press('ArrowLeft',x<-.35);press('ArrowUp',y>.35);press('ArrowDown',y<-.35);
      requestAnimationFrame(tick);
    })();
  },before.recoveries);
  await wait(page,n=>window.__mirio.snapshot().chapterRun.recoveries>n,before.recoveries);
  const rescued=(await snap(page)).chapterRun;assert.equal(rescued.notes,1);assert.equal(rescued.penalty,2);
  console.log('ok alternate bank, gutter catch and carried-note recovery');
  await page.evaluate(()=>{
    window.__marblePad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};
    navigator.getGamepads=()=>[window.__marblePad];window.__marblePad.axes[0]=.6;
  });
  await wait(page,()=>window.__mirio.snapshot().chapterRun.speed>1);
  await page.evaluate(()=>{window.__marblePad.axes[0]=0;window.__marblePad.buttons[0]={value:1,pressed:true};});
  await wait(page,()=>window.__mirio.snapshot().chapterRun.speed<.3);
  await page.evaluate(()=>{window.__marblePad.buttons[2]={value:1,pressed:true};});
  await wait(page,()=>window.__mirio.snapshot().chapterRun.cooldown>0);
  await page.evaluate(()=>{window.__marblePad.buttons[9]={value:1,pressed:true};});
  await wait(page,()=>window.__mirio.snapshot().paused);const paused=(await snap(page)).time;
  await page.waitForTimeout(200);assert.equal((await snap(page)).time,paused);
  console.log('ok controller acceleration/brake/pulse/pause');await desktop.close();
  }
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),phone=await load(mobile);
  const touch=await mobile.newCDPSession(phone),stick={x:72,y:730};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,id:1}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x,y:stick.y-32,id:1}]});
  await wait(phone,()=>window.__mirio.snapshot().chapterRun.speed>1.5);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const brakeBox=await phone.locator('#btn-jump').boundingBox(),brake={x:brakeBox.x+brakeBox.width/2,y:brakeBox.y+brakeBox.height/2};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...brake,id:1}]});
  await wait(phone,()=>window.__mirio.snapshot().chapterRun.speed<.3);
  assert.ok((await snap(phone)).chapterRun.braking);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await phone.tap('#btn-spin');await wait(phone,()=>window.__mirio.snapshot().chapterRun.cooldown>0);
  for(const selector of ['#btn-jump','#btn-spin','#chapter-hud']){
    const b=await phone.locator(selector).boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=390&&b.y+b.height<=844,selector);
  }
  await shot(phone,'marble-phone');console.log('ok touch acceleration/brake/pulse and390×844layout');await mobile.close();
  assert.deepEqual(errors,[]);
  }
}finally{await browser.close();}
