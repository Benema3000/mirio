// The Vulkanreise through the real input: walking, the Glutbeere, the rocket
// to the Aschemond, and Glutzahn's fight starting. The fight itself is played
// in tests/mirio-volcano.test.mjs; staging uses the chapterSeek hook.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],results=[];
const run=page=>page.evaluate(()=>window.__mirio.snapshot().chapterRun);
async function check(name,fn){try{await fn();results.push(true);console.log(`ok   ${name}`);}catch(e){results.push(false);console.error(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);}}
async function gameTime(page,s){const t=(await run(page)).time;await page.waitForFunction(t=>window.__mirio.snapshot().chapterRun.time>=t,t+s,{timeout:120000});}
/** Walks Mirio to `target` with the arrow keys, steering by the camera. */
async function walkTo(page,target,stop=1,limit=40){
  await page.evaluate(({target,stop,limit})=>{
    const held=new Set(),press=(c,on)=>{if(held.has(c)===on)return;on?held.add(c):held.delete(c);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code:c,key:c,bubbles:true}));};
    const pilot=window.__walk={done:false},t0=window.__mirio.snapshot().chapterRun.time,dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    (function tick(){
      const r=window.__mirio.snapshot().chapterRun,d=target.map((v,i)=>v-r.pos[i]),dist=Math.hypot(...d);
      if(dist<stop||r.phase!=='play'||r.time-t0>limit){for(const c of [...held])press(c,false);pilot.done=true;return;}
      const x=dot(d,r.right)/dist,y=dot(d,r.forward)/dist;
      press('ArrowLeft',x<-.25);press('ArrowRight',x>.25);press('ArrowUp',y>-.3);press('ArrowDown',y<-.7);
      requestAnimationFrame(tick);
    })();
  },{target,stop,limit});
  await page.waitForFunction(()=>window.__walk.done,null,{timeout:240000});
}
try{
  const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test&menu`,{timeout:90000});
  await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:90000});
  await check('the journey opens from the chooser with its own countdown',async()=>{
    await page.click('[data-level="volcano"]');await page.click('#start');
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.status==='playing'&&window.__mirio.snapshot().chapterRun.time>0,null,{timeout:90000});
    assert.equal((await page.evaluate(()=>window.__mirio.snapshot())).selectedLevel,'volcano');
    assert.match(await page.textContent('#bits'),/^0 \/ \d+$/);
  });
  await check('arrow keys walk Mirio over the Glutwelt',async()=>{
    const before=(await run(page)).pos;
    await page.keyboard.down('ArrowUp');await gameTime(page,1.5);await page.keyboard.up('ArrowUp');
    const after=(await run(page)).pos;
    assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>3);
  });
  await check('the Glutbeere turns Mirio into Miro\'s big Mirio',async()=>{
    await page.evaluate(()=>window.__mirio.chapterSeek(.35));
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.powered,null,{timeout:60000});
  });
  await check('walking into the rocket flies Mirio to the Aschemond',async()=>{
    await page.evaluate(()=>window.__mirio.chapterSeek(.6));await gameTime(page,.5);
    const rocket=await page.evaluate(()=>window.__mirio.layout().chapterCourse.rocket);
    await walkTo(page,rocket,.5);
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='rocket',null,{timeout:60000});
    await page.waitForFunction(()=>{const r=window.__mirio.snapshot().chapterRun;return r.phase==='play'&&r.planet==='aschemond';},null,{timeout:120000});
  });
  await check('reaching the arena starts Glutzahn\'s fight and shows the hearts',async()=>{
    await page.evaluate(()=>window.__mirio.chapterSeek(1));
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.fight,null,{timeout:60000});
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.boss.mode==='walk',null,{timeout:60000});
    assert.equal(await page.isVisible('#hearts'),true);
  });
  await check('the journey logs no browser errors',async()=>assert.deepEqual(errors,[]));
}finally{await browser.close();}
const failed=results.filter(r=>!r).length;
console.log(`\n${results.length-failed}/${results.length} Vulkanreise checks passed`);
process.exit(failed?1:0);
