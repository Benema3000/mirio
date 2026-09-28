// Complete postal journey through real keyboard input; no seeks.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8766/'}?test&menu`);await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:120000});
await page.click('[data-level="sky"]');await page.click('#start');await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
// Steer through the actual keyboard pipeline; no simulation seeks or state writes.
await page.evaluate(()=>{
 const held=new Set();
 const key=(code,on)=>{if(on===held.has(code))return;window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));on?held.add(code):held.delete(code);};
 window.postFlight={log:[],lastAction:0,lastJump:0,done:false};
 const timer=setInterval(()=>{
  const state=window.__mirio.snapshot(),run=state.chapterRun,course=window.__mirio.layout().chapterCourse;
  if(state.state==='win'){for(const code of held)key(code,false);clearInterval(timer);window.postFlight.done=true;return;}
  const pending=course.deliveries.filter(d=>!run.delivered.includes(d.id)&&d.s>run.distance-20).sort((a,b)=>a.s-b.s);
  const target=pending[0]??{x:0,y:0,s:course.length};
  const dx=target.x-run.x,dy=target.y-run.y;
  key('ArrowRight',dx>.3);key('ArrowLeft',dx<-.3);key('ArrowUp',dy>.3);key('ArrowDown',dy<-.3);
  key('ShiftLeft',false);key('Space',false);
  if(target.s-run.distance<52&&Math.hypot(dx,dy)<2&&run.elapsed-window.postFlight.lastAction>1.5){key('ShiftLeft',true);window.postFlight.lastAction=run.elapsed;}
 },50);
});
await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.distance>207,null,{timeout:60000});if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/sky-delivery.png`});
await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.distance>470,null,{timeout:60000});if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/sky-lanes.png`});
await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.distance>1460,null,{timeout:180000});if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/sky-whale.png`});
await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.distance>1710,null,{timeout:60000});if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/sky-arrival.png`});
await page.waitForFunction(()=>window.postFlight.done,null,{timeout:60000});
const run=await page.evaluate(()=>window.__mirio.snapshot().chapterRun);
assert.equal(run.deliveries,3);assert.equal(run.checkpoint,3);assert.equal(run.status,'finished');assert.deepEqual(errors,[]);
await page.click('#again');await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
const replay=await page.evaluate(()=>window.__mirio.snapshot().chapterRun);
assert.equal(replay.deliveries,0);assert.equal(replay.parcels,3);
await page.click('#pause-button');const time=await page.evaluate(()=>window.__mirio.snapshot().chapterRun.time);
await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__mirio.snapshot().chapterRun.time),time);
console.log('PASS complete postal flight, replay, pause');
} finally { await browser.close(); }
