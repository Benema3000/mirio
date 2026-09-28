// Complete safe and shortcut courses through ordinary Input, plus device/recovery checks.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PERSONAL_BEST_PREFIX} from '../js/course-version.js';
import {TILT_PATHS} from '../js/tilt-course.js';
import {TILT} from '../js/tilt-rules.js';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],wait=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:180000});
const snap=page=>page.evaluate(()=>window.__mirio.snapshot());
async function shot(page,name){if(!process.env.SHOTS)return;await mkdir(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${name}.png`});}
async function load(context){
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.0/**',async route=>{
    const name=route.request().url().split('three@0.186.0/')[1];
    await route.fulfill({body:await readFile(fileURLToPath(new URL('../node_modules/three/',import.meta.url))+name),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.addInitScript(prefix=>{
    localStorage.setItem(prefix+'marble','65432');window.__tiltSigns=[];
    const draw=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,maxWidth){
      if(this.canvas.width===512&&this.canvas.height===128&&/Breit|Neigen|Bremsen|Halten|Ziel/.test(text))
        window.__tiltSigns.push({text,width:Math.min(this.measureText(text).width,maxWidth??Infinity),available:this.canvas.width-24});
      return maxWidth===undefined?draw.call(this,text,x,y):draw.call(this,text,x,y,maxWidth);
    };
  },PERSONAL_BEST_PREFIX);
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8767/'}?test`);
  await wait(page,()=>window.__mirio&&!document.querySelector('#start').disabled);
  await page.click('#start');await wait(page,()=>window.__mirio.snapshot().state==='hub');
  await page.click('#pause-button');await page.click('#pause-quick');await page.click('[data-level="tilt"]');
  await wait(page,()=>window.__mirio.snapshot().chapterRun?.countdown===0);return page;
}
function course(ids){return ids.flatMap(id=>TILT_PATHS.find(path=>path.id===id).points.slice(1).map(point=>[...point,id==='rainbow-ribbon'&&point[1]===78?'foam':null]));}
async function drive(page,route,name){
  await page.evaluate(({route,physics})=>{
    const held=new Set(),pulse={x:0,y:0};
    const press=(code,active)=>{
      if(held.has(code)===active)return;active?held.add(code):held.delete(code);
      window.dispatchEvent(new KeyboardEvent(active?'keydown':'keyup',{code,key:code,bubbles:true}));
    };
    const stop=()=>{for(const code of [...held])press(code,false);};
    const pilot=window.__tiltPilot={index:0,done:false,error:null,snapshot:null};let since=0,lastIndex=-1;
    function tick(){
      const state=window.__mirio.snapshot(),r=state.chapterRun;
      if(state.state==='win'){stop();pilot.done=true;pilot.snapshot=r;return;}
      if(state.state!=='chapter'){stop();pilot.error=`unexpected ${state.state}`;return;}
      if(pilot.index!==lastIndex){lastIndex=pilot.index;since=r.time;}
      if(r.time-since>30){stop();pilot.error=JSON.stringify({target:route[pilot.index],run:r});return;}
      if(r.recoveries>0){stop();pilot.error=`unplanned catch ${JSON.stringify(r)}`;return;}
      const [tx,ty,,toy]=route[Math.min(pilot.index,route.length-1)],dx=tx-r.x,dy=ty-r.y,distance=Math.hypot(dx,dy);
      if(distance<.85&&r.speed<1&&(!toy||r.bridgeOpen)&&pilot.index<route.length-1){pilot.index++;requestAnimationFrame(tick);return;}
      const wanted=Math.min(4.5,distance*1.8),scale=wanted/Math.max(.01,distance);
      const ax=(dx*scale-r.vx)*2.2+physics.drag*r.vx,ay=(dy*scale-r.vy)*2.2+physics.drag*r.vy;
      const angle=value=>Math.asin(Math.max(-.9,Math.min(.9,value)))/physics.maxAngle;
      let x=angle(r.surfaceSlope.x+ax/physics.gravity),y=angle(r.surfaceSlope.y+ay/physics.gravity),length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;
      pulse.x+=x;pulse.y+=y;
      const turnX=pulse.x>.5?1:pulse.x<-.5?-1:0,turnY=pulse.y>.5?1:pulse.y<-.5?-1:0;
      pulse.x-=turnX;pulse.y-=turnY;
      press('ArrowLeft',turnX<0);press('ArrowRight',turnX>0);press('ArrowUp',turnY>0);press('ArrowDown',turnY<0);
      press('Space',distance<.85&&(r.speed>.6||toy||pilot.index===route.length-1));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },{route,physics:{drag:TILT.drag,maxAngle:TILT.maxAngle,gravity:TILT.gravity}});
  let reported=-1;const deadline=Date.now()+600000;
  while(Date.now()<deadline){
    await page.waitForTimeout(400);const result=await page.evaluate(()=>window.__tiltPilot);assert.equal(result.error,null);
    if(Math.floor(result.index/3)!==reported){reported=Math.floor(result.index/3);console.log(`${name} ${result.index}/${route.length}`);await shot(page,`tilt-${name}-${reported}`);}
    if(result.done)return result.snapshot;
  }
  assert.fail('tilt keyboard course timed out');
}
try{
  if(process.env.SIGNS_ONLY){
    const context=await browser.newContext({viewport:{width:900,height:650}}),page=await load(context);
    const signs=await page.evaluate(()=>window.__tiltSigns);assert.ok(signs.length>=7);
    assert.deepEqual(signs.filter(sign=>sign.width>sign.available),[],'fork arrows must fit their signs');
    await page.evaluate(()=>window.__mirio.chapterSeek(.5));await page.waitForTimeout(200);await shot(page,'tilt-fork-labels');
    console.log('ok all fork arrows fit their canvas signs');await context.close();
  }else{
  if(!process.env.TOUCH_ONLY){
    const desktop=await browser.newContext({viewport:{width:900,height:650}}),page=await load(desktop);
    await shot(page,'tilt-start');console.log('tilt rendering',JSON.stringify((await snap(page)).rendering));assert.equal(await page.locator('#btn-spin').isVisible(),false);
    if(!process.env.DEVICES_ONLY){
    const safe=await drive(page,course(['wash','rainbow-safe','lagoon-safe','towel-safe']),'safe');
    assert.equal(safe.checkpoint,3);assert.equal(safe.shortcuts,0);assert.equal(safe.bridgeOpen,false);assert.ok(safe.time>=45&&safe.time<=90);
    console.log(`ok ordinary keyboard safe route ${safe.time.toFixed(2)}s; no catches`);await shot(page,'tilt-safe-finish');
    const best=await page.evaluate(prefix=>({tilt:localStorage.getItem(prefix+'tilt'),marble:localStorage.getItem(prefix+'marble')}),PERSONAL_BEST_PREFIX);
    assert.ok(Number(best.tilt)>0);assert.equal(best.marble,'65432');
    await page.click('#again');await wait(page,()=>window.__mirio.snapshot().chapterRun?.countdown===0);
    assert.equal((await snap(page)).chapterRun.checkpoint,0);
    const shortcuts=await drive(page,course(['wash','rainbow-ribbon','foam','towel-ribbon']),'shortcuts');
    assert.equal(shortcuts.shortcuts,3);assert.equal(shortcuts.bridgeOpen,true);assert.ok(shortcuts.time<safe.time);
    console.log(`ok ordinary keyboard three shortcuts ${shortcuts.time.toFixed(2)}s; foam built, no catches`);
    await page.click('#again');await wait(page,()=>window.__mirio.snapshot().chapterRun?.countdown===0);
    }
    // Stage the basin only for recovery/device tests; both preceding full runs use no seek.
    await page.evaluate(()=>window.__mirio.chapterSeek(.5));await page.keyboard.down('Space');
    await wait(page,()=>window.__mirio.snapshot().chapterRun.bridgeOpen);await page.keyboard.up('Space');
    await page.evaluate(()=>window.__mirio.chapterSeek('lagoon-safe'));
    await page.keyboard.down('ArrowLeft');await wait(page,()=>window.__mirio.snapshot().chapterRun.recoveries>0);await page.keyboard.up('ArrowLeft');
    const caught=(await snap(page)).chapterRun;assert.equal(caught.checkpoint,2);assert.equal(caught.bridgeOpen,true);assert.equal(caught.penalty,2);
    await shot(page,'tilt-towel-catch');console.log('ok towel catch preserves checkpoint and foam, adds2s');
    await page.evaluate(()=>window.__mirio.chapterSeek(0));
    await page.evaluate(()=>{
      window.__tiltPad={connected:true,mapping:'standard',axes:[0,-.7,0,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};navigator.getGamepads=()=>[window.__tiltPad];
    });
    await wait(page,()=>window.__mirio.snapshot().chapterRun.speed>1.5);console.log('controller moving');
    await page.evaluate(()=>{window.__tiltPad.axes[1]=0;window.__tiltPad.buttons[0]={value:1,pressed:true};});
    await wait(page,()=>window.__mirio.snapshot().chapterRun.speed<.3);assert.ok((await snap(page)).chapterRun.braking);console.log('controller braking');
    await page.evaluate(()=>{window.__tiltPad.buttons[9]={value:1,pressed:true};});await wait(page,()=>window.__mirio.snapshot().paused);console.log('controller paused');
    const paused=(await snap(page)).time;await page.waitForTimeout(200);assert.equal((await snap(page)).time,paused);
    await page.evaluate(()=>{window.__tiltPad.buttons[9]={value:0,pressed:false};window.__tiltPad.buttons[0]={value:0,pressed:false};});
    await page.check('#reduced-motion');await page.click('#resume');assert.deepEqual((await snap(page)).cameraUp,[0,1,0]);
    await page.evaluate(()=>{window.__tiltPad.connected=false;});
    // Trusted held-brake release stays on the result; a new press replays.
    await page.keyboard.down('Space');await page.evaluate(()=>window.__mirio.chapterSeek(.99));await wait(page,()=>window.__mirio.snapshot().state==='win');
    await page.keyboard.down('Space');await page.keyboard.up('Space');await page.waitForTimeout(200);assert.equal((await snap(page)).state,'win');
    await page.keyboard.press('Space');await wait(page,()=>window.__mirio.snapshot().state==='chapter');
    await page.click('#pause-button');await page.click('#pause-menu');await wait(page,()=>window.__mirio.snapshot().state==='hub');
    assert.ok(!await page.locator('body').evaluate(node=>node.classList.contains('chapter-single-action')));
    console.log('ok controller tilt/brake/pause, reduced motion, held finish, replay and hub controls');await desktop.close();
  }
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),phone=await load(mobile);
  assert.equal(await phone.locator('#btn-spin').isVisible(),false);assert.match(await phone.locator('#btn-jump').getAttribute('aria-label'),/brems|beruhig/i);
  const touch=await mobile.newCDPSession(phone),stick={x:72,y:730};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,id:1}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x,y:stick.y-32,id:1}]});await wait(phone,()=>window.__mirio.snapshot().chapterRun.speed>1.5);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const brakeBox=await phone.locator('#btn-jump').boundingBox(),brake={x:brakeBox.x+brakeBox.width/2,y:brakeBox.y+brakeBox.height/2};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...brake,id:1}]});await wait(phone,()=>window.__mirio.snapshot().chapterRun.speed<.3);
  assert.ok((await snap(phone)).chapterRun.braking);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await pageBasin(phone,touch,brake);
  for(const selector of ['#btn-jump','#chapter-hud']){
    const b=await phone.locator(selector).boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=390&&b.y+b.height<=844,selector);
  }
  await shot(phone,'tilt-phone-foam');await phone.tap('#pause-button');await phone.tap('#pause-menu');await wait(phone,()=>window.__mirio.snapshot().state==='hub');
  assert.equal(await phone.locator('#btn-spin').isVisible(),true);
  console.log('ok touch tilt/brake/foam,390×844layout and hub spin restored');await mobile.close();assert.deepEqual(errors,[]);
  }
}finally{await browser.close();}
async function pageBasin(page,touch,brake){
  await page.evaluate(()=>window.__mirio.chapterSeek(.5));
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...brake,id:1}]});await wait(page,()=>window.__mirio.snapshot().chapterRun.bridgeOpen);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
