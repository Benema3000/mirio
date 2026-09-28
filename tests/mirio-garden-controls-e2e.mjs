// Device actions use the ordinary input layer; seek only stages empty room floors.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
await context.addInitScript(()=>{
  window.testPad={connected:false,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.testPad]});
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const snap=()=>page.evaluate(()=>window.__mirio.snapshot());
const wait=fn=>page.waitForFunction(fn,null,{timeout:60000});
const gameTime=async seconds=>{const target=(await snap()).chapterRun.time+seconds;await page.waitForFunction(t=>window.__mirio.snapshot().chapterRun.time>=t,target,{timeout:60000});};
try{
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test&menu`);
  await wait(()=>window.__mirio&&!document.querySelector('#start').disabled);
  await page.tap('[data-level="ribbon"]');await page.tap('#start');await wait(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
  for(const id of ['#btn-spin','#btn-jump','#pause-button']){
    const box=await page.locator(id).boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844,id);
  }
  const touch=await context.newCDPSession(page),startX=(await snap()).chapterRun.x;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:100,y:650}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:50,y:650}]});
  await gameTime(.4);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok((await snap()).chapterRun.x<startX-1);
  await page.tap('#btn-jump');await wait(()=>window.__mirio.snapshot().chapterRun.y>.2);
  await page.tap('#btn-spin');await wait(()=>!window.__mirio.snapshot().chapterRun.airSpin);
  await gameTime(1.2);
  await page.evaluate(()=>window.__mirio.chapterSeek(.4));
  await page.tap('#pause-button');const paused=(await snap()).chapterRun;await page.waitForTimeout(250);assert.deepEqual((await snap()).chapterRun,paused);
  await page.check('#reduced-motion');await page.tap('#resume');await gameTime(1);
  await page.evaluate(()=>{window.testPad.connected=true;window.testPad.axes[0]=1;});
  const before=(await snap()).chapterRun.x;await gameTime(.5);assert.ok((await snap()).chapterRun.x>before+1);
  await page.evaluate(()=>{window.testPad.axes[0]=0;window.testPad.buttons[0]={pressed:true,value:1};});
  await wait(()=>window.__mirio.snapshot().chapterRun.y>.2);
  await page.evaluate(()=>{window.testPad.buttons[0]={pressed:false,value:0};window.testPad.buttons[2]={pressed:true,value:1};});
  await wait(()=>!window.__mirio.snapshot().chapterRun.airSpin);
  await page.evaluate(()=>{window.testPad.buttons[2]={pressed:false,value:0};window.testPad.connected=false;});await gameTime(1.2);
  await page.tap('#pause-button');await page.tap('#rescue');await wait(()=>!window.__mirio.snapshot().paused);
  assert.equal((await snap()).chapterRun.recoveries,1);
  await page.tap('#pause-button');await page.tap('#pause-menu');await wait(()=>window.__mirio.snapshot().state==='title');
  await page.tap('[data-level="ribbon"]');await page.tap('#start');await wait(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
  assert.equal((await snap()).chapterRun.seeds,0);assert.equal((await snap()).chapterRun.recoveries,0);
  assert.deepEqual(errors,[]);console.log('Garden touch, controller, pause, reduced motion, rescue, and restart passed');
}finally{await browser.close();}
