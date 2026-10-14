// The Raketenritt through the real input: the ride and its rings, the rescue,
// the landing, Mirio on foot on the Riesenstern, the arena shut without the
// Sternsplitter, climbing Krakel's glowing arm and stamping it, and the head
// stage to the crystal. The rules are played in tests/mirio-star.test.mjs;
// staging uses the chapterSeek hook (see StarRun.seek).
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],results=[];
const FLIGHT_CRUISE=40;
const run=page=>page.evaluate(()=>window.__mirio.snapshot().chapterRun);
const course=page=>page.evaluate(()=>window.__mirio.layout().chapterCourse);
async function check(name,fn){try{await fn();results.push(true);console.log(`ok   ${name}`);}catch(e){results.push(false);console.error(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);}}
async function gameTime(page,s){const t=(await run(page)).time;await page.waitForFunction(t=>window.__mirio.snapshot().chapterRun.time>=t,t+s,{timeout:120000});}
async function seek(page,f){await page.evaluate(f=>window.__mirio.chapterSeek(f),f);await gameTime(page,.3);}
/** Keyboard pilot in the page: `plan` runs every frame with the snapshot and returns keys to hold, keys to tap, or done. */
async function drive(page,plan,limit){
  return page.evaluate(({plan,limit})=>new Promise(resolve=>{
    const held=new Set(),press=(c,on)=>{if(held.has(c)===on)return;on?held.add(c):held.delete(c);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code:c,key:c,bubbles:true}));};
    const tap=(c,ms,delay=0)=>setTimeout(()=>{press(c,true);setTimeout(()=>press(c,false),ms);},delay);
    const step=new Function('r','A','memory','now',plan), A=window.__mirio.layout().chapterCourse, memory={}, t0=window.__mirio.snapshot().chapterRun.time;
    (function tick(){
      const r=window.__mirio.snapshot().chapterRun, out=step(r,A,memory,performance.now())??{};
      if(out.done||r.time-t0>limit){for(const c of [...held])press(c,false);resolve({...out,done:Boolean(out.done),time:r.time-t0});return;}
      for(const c of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])press(c,(out.hold??[]).includes(c));
      for(const [c,ms,delay] of out.tap??[])tap(c,ms,delay);
      requestAnimationFrame(tick);
    })();
  }),{plan,limit});
}
// Shared by the plans (as source): steer towards a world point with the camera's axes.
const STEER=`const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const steer=(target,stop=.4)=>{const d=sub(target,r.pos),h=dot(d,r.up),f=d.map((v,i)=>v-h*r.up[i]),dist=Math.hypot(...f);if(dist<stop)return {hold:[],dist,h};
const x=dot(f,r.right)/dist,y=dot(f,r.forward)/dist;return {hold:[...(x<-.3?['ArrowLeft']:[]),...(x>.3?['ArrowRight']:[]),...(y>-.2?['ArrowUp']:[]),...(y<-.7?['ArrowDown']:[])],dist,h};};`;
try{
  const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test&menu`,{timeout:90000});
  await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:90000});
  await check('the ride starts on the rocket after the countdown',async()=>{
    await page.click('[data-level="star"]');await page.click('#start');
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0&&window.__mirio.snapshot().chapterRun.time>0,null,{timeout:90000});
    assert.equal((await run(page)).phase,'flight');
    assert.match(await page.textContent('#bits'),/^◎ 0 · ☄ 0$/);
    const c=await course(page);
    assert.equal(c.belts.length,3);assert.ok(c.rings.length>40);
  });
  await check('flying through a ring fires a burst of speed',async()=>{
    const res=await drive(page,`const ring=A.rings.find(g=>g.s>r.distance+8);
      if(r.rings>0)return {done:true,burst:r.burst};
      const x=ring.x-r.x,y=ring.y-r.y;
      return {hold:[...(x<-.3?['ArrowLeft']:[]),...(x>.3?['ArrowRight']:[]),...(y>.3?['ArrowUp']:[]),...(y<-.3?['ArrowDown']:[])]};`,20);
    assert.ok(res.done,'no ring flown through');
    assert.ok(res.burst>0,'no burst');
    await gameTime(page,.2);
    assert.ok((await run(page)).speed>FLIGHT_CRUISE,'no faster');
  });
  await check('Space rolls the rocket',async()=>{
    await page.keyboard.press('Space');await gameTime(page,.1);
    const r=await run(page);assert.ok(r.roll>0||r.rollCooldown>0,'no roll');
  });
  await check('the rescue puts the rocket back at its checkpoint for two seconds',async()=>{
    await page.click('#pause-button');const before=await run(page);
    await page.click('#rescue');
    assert.match(await page.textContent('#toast'),/\+2 s/);
    await gameTime(page,.1);
    const r=await run(page),at=[0,...(await course(page)).checkpoints][before.checkpoint];
    assert.equal(r.penalty,before.penalty+2);
    assert.ok(Math.abs(r.distance-at)<12,`back at ${r.distance}, not ${at}`);
  });
  await check('the rocket lands on the Riesenstern and Mirio goes on on foot',async()=>{
    await seek(page,.449);
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='star'&&window.__mirio.snapshot().chapterRun.onGround,null,{timeout:60000});
    assert.match(await page.textContent('#bits'),/^✦ 0 \/ 3 · 0$/);
    const before=await run(page);
    await page.keyboard.down('ArrowUp');await gameTime(page,1);await page.keyboard.up('ArrowUp');
    const r=await run(page),moved=Math.hypot(...r.pos.map((v,i)=>v-before.pos[i]));
    assert.ok(moved>4,`walked ${moved.toFixed(1)} m`);
    await page.keyboard.down('Space');await gameTime(page,.2);await page.keyboard.up('Space');
    assert.equal((await run(page)).onGround,false,'no jump');
  });
  await check('without the three Sternsplitter the arena stays shut',async()=>{
    await seek(page,.74);
    const res=await drive(page,`${STEER} const s=steer(A.arena.center,1);
      if(r.phase==='arena')return {done:true};
      return {hold:s.hold,tap:r.onGround&&now-(memory.j??0)>500?[(memory.j=now,['Space',320])]:[]};`,12);
    const at=await run(page);
    assert.equal(res.done,false,`got onto the arena at ${JSON.stringify(at.arena)} with ${at.shards} Sternsplitter`);
    assert.equal((await run(page)).shards,0);
  });
  await check('Mirio climbs the glowing arm with the keyboard and stamps it',async()=>{
    await seek(page,.75);
    const res=await drive(page,`${STEER}
      if(r.boss.stage>1)return {done:true};
      const tops=A.arena.arms[0];
      let best=-1;tops.forEach((t,i)=>{const d=sub(t,r.pos),h=dot(d,r.up),f=Math.hypot(...d.map((v,k)=>v-h*r.up[k]));if(f<1.4&&h<.6&&h>-1.2)best=i;});
      let idx=best>=0?Math.min(best+1,tops.length-1):0;
      if(best<0)tops.forEach((t,i)=>{const d=sub(t,r.pos),h=dot(d,r.up),f=Math.hypot(...d.map((v,k)=>v-h*r.up[k]));if(h<2.8&&f<4&&i<tops.length-1)idx=Math.max(idx,i);});
      const s=steer(tops[idx],.3),atSpot=best===tops.length-1,tap=[];
      const wave=r.boss.waves.some(v=>{const dd=Math.hypot(r.arena.x-v.x,r.arena.z-v.z);return dd>v.r&&dd-v.r<1.3;})&&r.arena.height<.8;
      if(r.onGround&&!atSpot&&(s.h>.35&&s.dist<3.2||wave)&&now-(memory.j??0)>450){memory.j=now;tap.push(['Space',300]);}
      if(atSpot&&r.onGround&&now-(memory.p??0)>1100){memory.p=now;tap.push(['Space',300],['KeyC',60,420]);}
      return {hold:atSpot?[]:s.hold,tap};`,45);
    assert.ok(res.done,'the first arm was not stamped');
    assert.deepEqual((await run(page)).boss.curled,[true,false,false]);
  });
  await check('springs up onto the dazed head, two stamps, and the crystal',async()=>{
    await seek(page,.9);
    const res=await drive(page,`const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
      if(r.boss.mode==='defeated')return {done:true};
      const local=p=>{const d=sub(p,A.arena.center);return {x:dot(d,A.arena.right),z:dot(d,A.arena.forward)};};
      const me=r.arena,head=r.boss.head,springs=A.arena.springs.map(local);
      const target=r.onGround&&me.height<1?springs.reduce((a,b)=>Math.hypot(a.x-me.x,a.z-me.z)<Math.hypot(b.x-me.x,b.z-me.z)?a:b):head;
      const dl=[target.x-me.x,target.z-me.z],dist=Math.hypot(...dl),world=A.arena.right.map((v,i)=>v*dl[0]+A.arena.forward[i]*dl[1]);
      const x=dot(world,r.right)/(dist||1),y=dot(world,r.forward)/(dist||1),go=dist>.4,tap=[];
      if(!r.onGround&&r.boss.mode==='dazed'&&dist<2.5&&me.height>head.top+.5&&now-(memory.p??0)>800){memory.p=now;tap.push(['KeyC',60]);}
      return {hold:go?[...(x<-.3?['ArrowLeft']:[]),...(x>.3?['ArrowRight']:[]),...(y>.3?['ArrowUp']:[]),...(y<-.3?['ArrowDown']:[])]:[],tap};`,60);
    assert.ok(res.done,'Krakel still stands');
    const finish=await drive(page,`${STEER} if(r.status==='finished')return {done:true}; return {hold:steer(A.arena.center,.2).hold};`,20);
    assert.ok(finish.done,'the crystal was not reached');
    await page.waitForFunction(()=>!document.querySelector('#win').classList.contains('hidden'),null,{timeout:10000});
    assert.equal(await page.textContent('#win-title'),'Krakel lacht!');
  });
  assert.deepEqual(errors,[],errors.join('\n'));
}finally{await browser.close();}
if(results.includes(false))process.exit(1);
