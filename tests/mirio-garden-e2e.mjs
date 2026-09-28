// Native keyboard play through the whole garden, with no seeks or state mutation:
// every seed on the way, the creeks jumped, the tower climbed to the Blütentor.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const SHOTS=process.env.SHOTS;
await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test&menu`);
await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled);
await page.click('[data-level="ribbon"]');await page.click('#start');
await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0,null,{timeout:60000});
await page.evaluate(()=>{
  const keys=new Set();window.pilot={target:null,done:false,failure:null};
  const key=(code,down)=>{if(keys.has(code)===down)return;if(down)keys.add(code);else keys.delete(code);window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));};
  const layout=window.__mirio.layout().chapterCourse;
  const supported=(r,x)=>layout.platforms.some(p=>!p.move&&Math.abs(p.y-r.y)<.05&&Math.abs(x-p.x)<=p.w/2);
  const frame=()=>{
    const r=window.__mirio.snapshot().chapterRun,t=window.pilot.target;
    if(!t){for(const code of [...keys])key(code,false);requestAnimationFrame(frame);return;}
    const dx=t.x-r.x;
    if(r.status==='finished'||Math.abs(dx)<.6&&r.grounded&&Math.abs(r.y-t.y)<.5){window.pilot.done=true;window.pilot.target=null;requestAnimationFrame(frame);return;}
    if(r.time>t.until){window.pilot.failure=JSON.stringify(r);window.pilot.target=null;requestAnimationFrame(frame);return;}
    const wanted=dx-r.vx*.15;key('KeyD',wanted>.14);key('KeyA',wanted<-.14);
    if(r.grounded){
      const climb=r.y<t.y-.3&&Math.abs(dx)<7.1,creek=r.y<.05&&!supported(r,r.x+Math.sign(dx)*1.4);
      key('Space',climb||creek);
    }
    requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
});
const snap=()=>page.evaluate(()=>window.__mirio.snapshot().chapterRun);
async function reach(x,y){
  await page.evaluate(({x,y})=>{window.pilot.done=false;window.pilot.failure=null;window.pilot.target={x,y,until:window.__mirio.snapshot().chapterRun.time+25};},{x,y});
  await page.waitForFunction(()=>window.pilot.done||window.pilot.failure,{},{timeout:240000});
  const failure=await page.evaluate(()=>window.pilot.failure);
  assert.equal(failure,null,`could not reach ${x},${y}`);
}
const ROUTE={
  courtyard:[[16,1.8],[24,3.4],[44,4.6]],
  orchard:[[82,1.8],[89,3.5],[96,5.2],[103,6.9],[109,8.4],[115,8.4],[122,5.4]],
  glass:[[168,1.7],[175,3.4],[182,5.1],[189,6.8],[195,8.4],[203,8.4]],
  cellar:[[224,0],[264,4.4]],
  tower:[[306,2],[315,4],[306,6],[315,8],[306,10],[315,12]],
};
try{
  for(const [part,points] of Object.entries(ROUTE)){
    for(const [x,y] of points)await reach(x,y);
    if(SHOTS)await page.screenshot({path:`${SHOTS}/garden-${part}.png`});
    console.log('reached',part,(await snap()).seeds,'seeds');
  }
  const finished=await snap();
  assert.equal(finished.status,'finished');assert.equal(finished.seeds,3);assert.equal(finished.recoveries,0);
  await page.waitForFunction(()=>!document.querySelector('#win').classList.contains('hidden'));
  if(SHOTS)await page.screenshot({path:`${SHOTS}/garden-win.png`});
  console.log('FINISHED',finished.time.toFixed(1),'s');
  await page.click('#again');await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
  assert.equal((await snap()).seeds,0);assert.equal((await snap()).status,'playing');
  assert.deepEqual(errors,[]);
}catch(e){await page.screenshot({path:'/tmp/garden-failure.png'});throw e;}finally{await browser.close();}
