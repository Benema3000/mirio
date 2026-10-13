// The Raketenritt through the real input: the countdown, steering the rocket,
// a star shot, the rescue, the landing on the Riesenstern and climbing
// Krakel's arm, and the head stage. The rules (shots, waves, tickles, a whole
// run) are played in tests/mirio-star.test.mjs; staging uses chapterSeek.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],results=[];
const run=page=>page.evaluate(()=>window.__mirio.snapshot().chapterRun);
async function check(name,fn){try{await fn();results.push(true);console.log(`ok   ${name}`);}catch(e){results.push(false);console.error(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);}}
async function gameTime(page,s){const t=(await run(page)).time;await page.waitForFunction(t=>window.__mirio.snapshot().chapterRun.time>=t,t+s,{timeout:120000});}
async function seek(page,f){await page.evaluate(f=>window.__mirio.chapterSeek(f),f);await gameTime(page,.3);}
try{
  const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test&menu`,{timeout:90000});
  await page.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:90000});
  await check('the ride starts on the rocket after the countdown',async()=>{
    await page.click('[data-level="star"]');await page.click('#start');
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0&&window.__mirio.snapshot().chapterRun.time>0,null,{timeout:90000});
    const r=await run(page);
    assert.equal((await page.evaluate(()=>window.__mirio.snapshot())).selectedLevel,'star');
    assert.equal(r.phase,'flight');
    assert.match(await page.textContent('#bits'),/^☄ 0 · ✦ 0$/);
    const c=(await page.evaluate(()=>window.__mirio.layout().chapterCourse));
    assert.equal(c.stages.length,4);assert.ok(c.asteroids.length>30);
  });
  await check('the arrow keys steer the rocket and Space rolls it',async()=>{
    await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowUp');await gameTime(page,.6);
    await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowUp');
    let r=await run(page);
    assert.ok(r.x>2&&r.y>2,`rocket at ${r.x.toFixed(1)}, ${r.y.toFixed(1)}`);
    await page.keyboard.press('Space');await gameTime(page,.1);
    r=await run(page);assert.ok(r.roll>0||r.rollCooldown>0,'no roll');
  });
  await check('a star shot from right in front breaks a small asteroid',async()=>{
    const a=(await page.evaluate(()=>window.__mirio.layout().chapterCourse.asteroids)).find(a=>a.hp===1&&a.s>300&&Math.abs(a.x)<6&&Math.abs(a.y)<4);
    await seek(page,(a.s-40)/1500*.55);
    const keys={x:a.x>0?'ArrowRight':'ArrowLeft',y:a.y>0?'ArrowUp':'ArrowDown'};
    // Steer onto its line, then fire a stream of stars.
    for(let i=0;i<40;i++){
      const r=await run(page);if(r.asteroids>0||r.distance>a.s)break;
      const dx=a.x-r.x,dy=a.y-r.y;
      for(const [k,on] of [['ArrowRight',dx>.4],['ArrowLeft',dx<-.4],['ArrowUp',dy>.4],['ArrowDown',dy<-.4]])await (on?page.keyboard.down(k):page.keyboard.up(k));
      await page.keyboard.press('ShiftLeft');await page.waitForTimeout(40);
    }
    for(const k of Object.values(keys))await page.keyboard.up(k);
    assert.ok((await run(page)).asteroids>=1,'no asteroid broke');
  });
  await check('the rescue puts the rocket back at the checkpoint for two seconds',async()=>{
    await page.click('#pause-button');const before=await run(page);
    await page.click('#rescue');
    assert.match(await page.textContent('#toast'),/\+2 s/);
    await gameTime(page,.1);
    const r=await run(page);
    assert.equal(r.penalty,before.penalty+2);
    // Seeking earns no checkpoints, so this is the one flown through, or the start.
    const at=[0,...(await page.evaluate(()=>window.__mirio.layout().chapterCourse.checkpoints))][before.checkpoint];
    assert.ok(Math.abs(r.distance-at)<10,`back at ${r.distance}, not ${at}`);
  });
  await check('the rocket lands on the Riesenstern and Mirio climbs the first arm',async()=>{
    await seek(page,.549);
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='landing',null,{timeout:60000});
    await page.waitForFunction(()=>window.__mirio.snapshot().chapterRun.phase==='climb',null,{timeout:60000});
    assert.match(await page.textContent('#bits'),/^Linker Arm · 0 \/ 3$/);
    await page.keyboard.down('ArrowUp');await gameTime(page,1.5);await page.keyboard.up('ArrowUp');
    const r=await run(page);
    assert.equal(r.stageId,'arm-left');
    assert.ok(r.climb.s>2,`climbed ${r.climb.s}`);
  });
  await check('the last climb runs over Krakel\'s head',async()=>{
    await seek(page,.98);
    const r=await run(page);
    assert.equal(r.stageId,'head');assert.equal(r.armsDown,3);
    assert.match(await page.textContent('#bits'),/^Krakels Kopf · 0 \/ 5$/);
  });
  assert.deepEqual(errors,[],errors.join('\n'));
}finally{await browser.close();}
if(results.includes(false))process.exit(1);
