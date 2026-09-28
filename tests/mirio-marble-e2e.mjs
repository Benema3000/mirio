// Complete pinball through ordinary Input, then exercise recovery and each device.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PERSONAL_BEST_PREFIX,personalBestKey} from '../js/course-version.js';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],wait=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:180000});
const snap=page=>page.evaluate(()=>window.__mirio.snapshot());
async function shot(page,name){if(!process.env.SHOTS)return;await mkdir(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${name}.png`});}
async function load(context){
  await context.addInitScript(({legacy,tilt})=>{localStorage.setItem(legacy,'52380');localStorage.setItem(tilt,'61000');},
    {legacy:PERSONAL_BEST_PREFIX+'marble',tilt:personalBestKey('tilt')});
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
async function play(page){
  await page.evaluate(()=>{
    const held=new Set(),pilot=window.__pinballPilot={done:false,error:null,table:0};
    const press=(code,active)=>{
      if(held.has(code)===active)return;active?held.add(code):held.delete(code);
      window.dispatchEvent(new KeyboardEvent(active?'keydown':'keyup',{code,key:code,bubbles:true}));
    };
    const stop=()=>{for(const code of [...held])press(code,false);};
    function tick(){
      const state=window.__mirio.snapshot(),r=state.chapterRun;
      if(state.state==='win'){stop();pilot.done=true;return;}
      if(state.state!=='chapter'||r.time>240){stop();pilot.error=JSON.stringify(state);return;}
      pilot.table=r.table;
      press('Space',r.served&&r.plungerCharge<.9);
      const flip=!r.served&&r.y<11&&r.vy<0;
      press('ArrowLeft',flip);press('ArrowRight',flip);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  let table=-1;const deadline=Date.now()+360000;
  while(Date.now()<deadline){
    await page.waitForTimeout(400);const result=await page.evaluate(()=>window.__pinballPilot);
    assert.equal(result.error,null);
    if(result.table!==table){table=result.table;await shot(page,`pinball-table-${table+1}`);console.log(`pinball table ${table+1}/3`);}
    if(result.done)return;
  }
  assert.fail('keyboard pinball run timed out');
}
try{
  if(!process.env.TOUCH_ONLY){
    const desktop=await browser.newContext({viewport:{width:900,height:760},deviceScaleFactor:1}),page=await load(desktop);
    await page.waitForTimeout(600);await shot(page,'pinball-start');
    await page.keyboard.down('ArrowLeft');await wait(page,()=>window.__mirio.snapshot().chapterRun.flipperLeft);
    assert.equal((await snap(page)).chapterRun.flipperRight,false);
    await page.keyboard.down('ArrowRight');await wait(page,()=>window.__mirio.snapshot().chapterRun.flipperRight);
    assert.equal((await snap(page)).chapterRun.flipperLeft,true);await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowRight');
    if(!process.env.DEVICES_ONLY){
      await play(page);const finish=await snap(page);
      assert.equal(finish.chapterRun.notes,9);assert.equal(finish.chapterRun.table,2);assert.ok(finish.chapterRun.bumps>6);
      assert.ok(finish.time>40&&finish.time<240);await shot(page,'pinball-finish');
      const records=await page.evaluate(({current,legacy,tilt})=>({current:localStorage.getItem(current),legacy:localStorage.getItem(legacy),tilt:localStorage.getItem(tilt)}),
        {current:personalBestKey('marble'),legacy:PERSONAL_BEST_PREFIX+'marble',tilt:personalBestKey('tilt')});
      assert.ok(Number(records.current)>40000);assert.equal(records.legacy,'52380');assert.equal(records.tilt,'61000');
      console.log(`ok complete keyboard pinball ${finish.time.toFixed(2)}s;9 notes,${finish.chapterRun.recoveries} catches;versioned record preserves archives`);
      await page.click('#again');await wait(page,()=>window.__mirio.snapshot().chapterRun?.countdown===0);
      assert.equal((await snap(page)).chapterRun.notes,0);
    }
    await page.evaluate(()=>window.__mirio.chapterSeek(.5));const before=(await snap(page)).chapterRun;
    await page.evaluate(()=>window.__mirio.chapterSeek('drain'));await wait(page,()=>window.__mirio.snapshot().chapterRun.recoveries===1);
    const caught=(await snap(page)).chapterRun;assert.deepEqual(caught.noteIds,before.noteIds);assert.equal(caught.table,1);assert.equal(caught.penalty,2);
    await page.evaluate(()=>{
      window.__pinballPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};
      navigator.getGamepads=()=>[window.__pinballPad];window.__pinballPad.buttons[4]={value:1,pressed:true};
    });
    await wait(page,()=>window.__mirio.snapshot().chapterRun.flipperLeft);assert.equal((await snap(page)).chapterRun.flipperRight,false);
    await page.evaluate(()=>{window.__pinballPad.buttons[5]={value:1,pressed:true};});
    await wait(page,()=>window.__mirio.snapshot().chapterRun.flipperRight);
    await page.evaluate(()=>{window.__pinballPad.buttons[0]={value:1,pressed:true};});
    await wait(page,()=>window.__mirio.snapshot().chapterRun.plungerCharge>.5);
    await page.evaluate(()=>{window.__pinballPad.buttons[0]={value:0,pressed:false};});
    await wait(page,()=>!window.__mirio.snapshot().chapterRun.served);
    await page.evaluate(()=>{window.__pinballPad.buttons[2]={value:1,pressed:true};});
    await wait(page,()=>window.__mirio.snapshot().chapterRun.cooldown>0);
    await page.evaluate(()=>{window.__pinballPad.buttons[9]={value:1,pressed:true};});
    await wait(page,()=>window.__mirio.snapshot().paused);const paused=(await snap(page)).time;
    await page.waitForTimeout(250);assert.equal((await snap(page)).time,paused);
    await page.check('#reduced-motion');
    await page.evaluate(()=>{for(const button of window.__pinballPad.buttons){button.value=0;button.pressed=false;}});
    await page.click('#resume');await wait(page,()=>!window.__mirio.snapshot().paused);
    await wait(page,()=>!window.__mirio.snapshot().chapterRun.flipperLeft&&!window.__mirio.snapshot().chapterRun.flipperRight);
    assert.deepEqual((await snap(page)).cameraUp,[0,1,0]);
    assert.equal(await page.evaluate(()=>localStorage.getItem('mirio-motion')),'quiet');
    console.log('ok persistent catches, replay, independent shoulders, plunger, nudge, pause/releases and reduced motion');
    if(process.env.DEVICES_ONLY){
      await page.keyboard.down('Space');await page.evaluate(()=>window.__mirio.chapterSeek(.99));
      await wait(page,()=>window.__mirio.snapshot().state==='win');await page.keyboard.up('Space');
      assert.equal((await snap(page)).state,'win');
      const records=await page.evaluate(({current,legacy,tilt})=>({current:localStorage.getItem(current),legacy:localStorage.getItem(legacy),tilt:localStorage.getItem(tilt)}),
        {current:personalBestKey('marble'),legacy:PERSONAL_BEST_PREFIX+'marble',tilt:personalBestKey('tilt')});
      assert.ok(Number(records.current)>0);assert.equal(records.legacy,'52380');assert.equal(records.tilt,'61000');
      await page.keyboard.press('Space');await wait(page,()=>window.__mirio.snapshot().state==='chapter');
      assert.equal((await snap(page)).chapterRun.notes,0);
      console.log('ok versioned pinball record, preserved legacy/tilt, held finish key and fresh replay');
    }
    await desktop.close();
  }
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),phone=await load(mobile);
  const touch=await mobile.newCDPSession(phone);
  const center=async(selector,id)=>{const b=await phone.locator(selector).boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=390&&b.y+b.height<=844,selector);return {x:b.x+b.width/2,y:b.y+b.height/2,id};};
  const left=await center('#flipper-left',1),right=await center('#flipper-right',2),plunger=await center('#pinball-plunger',3);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
  await wait(phone,()=>window.__mirio.snapshot().chapterRun.flipperLeft);assert.equal((await snap(phone)).chapterRun.flipperRight,false);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,right]});
  await wait(phone,()=>window.__mirio.snapshot().chapterRun.flipperRight);assert.equal((await snap(phone)).chapterRun.flipperLeft,true);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(phone,()=>!window.__mirio.snapshot().chapterRun.flipperLeft&&!window.__mirio.snapshot().chapterRun.flipperRight);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[plunger]});
  await wait(phone,()=>window.__mirio.snapshot().chapterRun.plungerCharge>.5);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(phone,()=>!window.__mirio.snapshot().chapterRun.served);await shot(phone,'pinball-phone');
  console.log('ok touch flippers together, release, plunger and390×844layout');await mobile.close();assert.deepEqual(errors,[]);
}finally{await browser.close();}
