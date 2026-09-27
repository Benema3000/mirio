// Native keyboard play through the complete connected garden, with no seeks or state mutation.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test`);await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled);await page.click('[data-level="ribbon"]');await page.click('#start');await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
await page.evaluate(()=>{
 const keys=new Set();window.pilot={target:null,done:false,failure:null};
 const key=(code,down)=>{if(keys.has(code)===down)return;if(down)keys.add(code);else keys.delete(code);window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));};
 const frame=()=>{
  const r=window.__mirio.snapshot().chapterRun,t=window.pilot.target;
  if(!t){for(const code of [...keys])key(code,false);requestAnimationFrame(frame);return;}
  const dx=t.x-r.x;
  if(r.status==='finished'||Math.abs(dx)<.6&&r.grounded&&Math.abs(r.y-t.y)<.5){window.pilot.done=true;window.pilot.target=null;requestAnimationFrame(frame);return;}
  if(r.time>t.until){window.pilot.failure=JSON.stringify(r);window.pilot.target=null;requestAnimationFrame(frame);return;}
  const wanted=dx-r.vx*.15;key('KeyD',wanted>.14);key('KeyA',wanted<-.14);
  if(r.grounded){key('Space',false);if((r.y<t.y-.3||t.y>0&&Math.abs(r.y-t.y)<.4&&Math.abs(dx)>2)&&Math.abs(dx)<7.1)key('Space',true);}
  requestAnimationFrame(frame);
 };requestAnimationFrame(frame);
});
const snap=()=>page.evaluate(()=>window.__mirio.snapshot().chapterRun);
async function reach(x,y){await page.evaluate(({x,y})=>{window.pilot.done=false;window.pilot.failure=null;window.pilot.target={x,y,until:window.__mirio.snapshot().chapterRun.time+20};},{x,y});await page.waitForFunction(()=>window.pilot.done||window.pilot.failure,{},{timeout:180000});const s=await snap();assert.deepEqual(errors,[]);console.log('reach',x,y,JSON.stringify({x:s.x,y:s.y,seeds:s.seeds,time:s.time}));const f=await page.evaluate(()=>window.pilot.failure);if(f)throw new Error('Failed '+x+','+y+': '+f);}
async function action(){await page.keyboard.press('ShiftLeft');await page.waitForTimeout(1200);console.log('action',(await snap()).room);}
try{
if(process.env.GARDEN_ROUTE==='song'){
  await reach(49,0);await action();assert.equal((await snap()).dream,'awake');
  for(const [x,y]of [[57,1.7],[65,3.4],[73,5.1],[81,6.8],[89,8.4],[94,8.4]])await reach(x,y);
  await page.screenshot({path:'/tmp/garden-awake.png'});
  await reach(102,8.4);await action();await reach(-64,8.4);
  await reach(-55,0);assert.equal((await snap()).recoveries,0);
  await reach(-87,0);await action();assert.equal((await snap()).room,'cellar');
  await reach(164,3.4);
}else{
  for(const [x,y]of [[-27,2],[-36,3.7],[-45,5.4],[-54,7.1],[-64,8.4]])await reach(x,y);
  await page.screenshot({path:'/tmp/garden-orchard.png'});await reach(-74,8.4);await action();await reach(94,8.4);await page.screenshot({path:'/tmp/garden-conservatory.png'});
  await reach(113,0);await reach(109,0);await action();await reach(155,1.7);await reach(164,3.4);
}
await page.screenshot({path:'/tmp/garden-cellar.png'});await reach(125,0);await action();
for(const [x,y]of [[10,2],[19,4],[10,6],[19,8],[10,10],[19,12]])await reach(x,y);
await page.screenshot({path:'/tmp/garden-finish.png'});
const finished=await snap();assert.equal(finished.status,'finished');assert.equal(finished.seeds,3);assert.equal(finished.recoveries,0);assert.equal(finished.shortcuts,3);assert.deepEqual(errors,[]);
assert.ok(await page.isVisible('#win'));console.log('FINISHED',finished);
await page.click('#again');await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
assert.equal((await snap()).seeds,0);assert.equal((await snap()).status,'playing');
}catch(e){await page.screenshot({path:'/tmp/garden-failure.png'});throw e;}finally{await browser.close();}
