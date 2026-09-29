// The Vulkanreise through the real input: the Startstern and the rocket down
// to the Festland, Damai leading through the desert, a ravine fall, a spring
// flower, the Glutbeere, the log ride over the waterfall and waking up in
// Glutzahn's crater. The fight's three stages are played in
// tests/mirio-volcano.test.mjs; staging uses the chapterSeek hook.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],results=[];
const run=page=>page.evaluate(()=>window.__mirio.snapshot().chapterRun);
const course=page=>page.evaluate(()=>window.__mirio.layout().chapterCourse);
async function check(name,fn){try{await fn();results.push(true);console.log(`ok   ${name}`);}catch(e){results.push(false);console.error(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);}}
async function gameTime(page,s){const t=(await run(page)).time;await page.waitForFunction(t=>window.__mirio.snapshot().chapterRun.time>=t,t+s,{timeout:120000});}
async function seek(page,f){await page.evaluate(f=>window.__mirio.chapterSeek(f),f);await gameTime(page,.5);}
/** Walks Mirio to `target` with the arrow keys, steering by the camera; stops early on a phase change or a penalty. */
async function walkTo(page,target,stop=1,limit=40,jump=false){
  await page.evaluate(({target,stop,limit,jump})=>{
    const held=new Set(),press=(c,on)=>{if(held.has(c)===on)return;on?held.add(c):held.delete(c);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code:c,key:c,bubbles:true}));};
    const r0=window.__mirio.snapshot().chapterRun,pilot=window.__walk={done:false},dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    (function tick(){
      const r=window.__mirio.snapshot().chapterRun,d=target.map((v,i)=>v-r.pos[i]),dist=Math.hypot(...d);
      pilot.reason=dist<stop?'arrived':r.phase!==r0.phase?'phase':r.penalty!==r0.penalty?'penalty':r.time-r0.time>limit?'limit':'';
      if(pilot.reason){for(const c of [...held])press(c,false);pilot.done=true;return;}
      press('Space',jump);
      const x=dot(d,r.right)/dist,y=dot(d,r.forward)/dist;
      press('ArrowLeft',x<-.25);press('ArrowRight',x>.25);press('ArrowUp',y>-.3);press('ArrowDown',y<-.7);
      requestAnimationFrame(tick);
    })();
  },{target,stop,limit,jump});
  await page.waitForFunction(()=>window.__walk.done,null,{timeout:240000});
  return page.evaluate(()=>window.__walk.reason);
}
// The Festland is flat to the eye: local (x, z) is world (x, ~0, z) near the route.
const land=(x,z)=>[x,-(x*x+z*z)/40000,z];
try{
  const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test&menu`,{timeout:90000});
  await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:90000});
  await check('the journey opens on the tiny Startstern with its own countdown',async()=>{
    await page.click('[data-level="volcano"]');await page.click('#start');
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.status==='playing'&&window.__mirio.snapshot().chapterRun.time>0,null,{timeout:90000});
    const r=await run(page);
    assert.equal((await page.evaluate(()=>window.__mirio.snapshot())).selectedLevel,'volcano');
    assert.equal(r.phase,'start');assert.equal(r.planet,'startstern');
    assert.match(await page.textContent('#bits'),/^0 \/ \d+$/);
  });
  await check('walking into the rocket flies Mirio down to the flat Festland',async()=>{
    await walkTo(page,(await course(page)).rocket,.5);
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='rocket',null,{timeout:60000});
    await page.waitForFunction(()=>{const r=window.__mirio.snapshot().chapterRun;return r.phase==='land'&&r.planet==='festland';},null,{timeout:120000});
  });
  await check('Damai the pug joins in the desert and runs ahead along the route',async()=>{
    await walkTo(page,land(0,-45),2,20);
    const d=(await run(page)).damai;
    assert.ok(d.met,'Damai never met Mirio');
    assert.ok(d.s>20,`Damai stayed at s=${d.s}`);
  });
  await check('stepping into a forest ravine is a fall that costs 2 seconds',async()=>{
    await seek(page,.45);
    const before=(await run(page)).penalty,r=(await course(page)).ravines[0];
    await walkTo(page,land(6,(r.z0+r.z1)/2),.5,20);
    assert.equal((await run(page)).penalty-before,2);
  });
  await check('a spring flower bounces Mirio high up to its gems',async()=>{
    await seek(page,.5);
    const spring=(await course(page)).springs[0],gems=(await run(page)).collectibles;
    await walkTo(page,spring,1.2,20);
    await page.waitForFunction(y=>window.__mirio.snapshot().chapterRun.pos[1]>y+4,spring[1],{timeout:30000});
    await gameTime(page,1.5);
    assert.ok((await run(page)).collectibles>gems,'the bounce collected no gems');
  });
  await check('jumping onto the Glutbeere\'s ledge turns Mirio into Miro\'s big Mirio',async()=>{
    await seek(page,.5);
    const berry=(await course(page)).berries[0].pos;
    await walkTo(page,land(berry[0],berry[2]+3.5),.5,20);
    await walkTo(page,berry,.8,4,true);
    await gameTime(page,.5);
    assert.ok((await run(page)).powered,'Mirio did not grow');
  });
  await check('the log turns into a river ride that Mirio steers, Damai aboard',async()=>{
    await seek(page,.6);
    await walkTo(page,(await course(page)).log,.5,20);
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='river',null,{timeout:30000});
    const x0=(await run(page)).river.x;
    await page.keyboard.down('ArrowLeft');await gameTime(page,.8);await page.keyboard.up('ArrowLeft');
    const r=await run(page);
    assert.ok(Math.abs(r.river.x-x0)>.5,`steering moved the log only ${r.river.x-x0}`);
    assert.equal(r.damai.state,'sit');
  });
  await check('over the waterfall everything goes dark, then Mirio wakes in the Glutkessel',async()=>{
    await seek(page,.9);
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='dark',null,{timeout:180000});
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='arena',null,{timeout:30000});
  });
  await check('Glutzahn\'s fight starts in stage one and shows the hearts',async()=>{
    await seek(page,1);
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.fight,null,{timeout:60000});
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.boss.mode==='walk',null,{timeout:60000});
    assert.equal((await run(page)).stage,1);
    assert.equal(await page.isVisible('#hearts'),true);
  });
  await check('the journey logs no browser errors',async()=>assert.deepEqual(errors,[]));
}finally{await browser.close();}
const failed=results.filter(r=>!r).length;
console.log(`\n${results.length-failed}/${results.length} Vulkanreise checks passed`);
process.exit(failed?1:0);
