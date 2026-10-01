// Real UI/device integration for the chapter selector, both new outings and
// direct kart entry. Public submissions go only to the configured local server.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {CHAPTERS} from '../js/chapters.js';
import {personalBestKey} from '../js/course-version.js';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const results=[];
const snap=page=>page.evaluate(()=>window.__mirio.snapshot());
const until=(page,fn,arg,timeout=60000)=>page.waitForFunction(fn,arg,{timeout,polling:75});
const gameTime=async(page,seconds)=>{const s=await snap(page);await until(page,t=>window.__mirio.snapshot().time>=t,s.time+seconds);};
async function check(name,fn){try{await fn();results.push(true);console.log(`ok   ${name}`);}catch(e){results.push(false);console.error(`FAIL ${name}\n${e.message}`);}}
async function shot(page,name){if(process.env.SHOTS){await mkdir(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${name}.png`});}}
async function open(options){
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/status of 503/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{
    window.__testPad={connected:false,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__testPad]});
  });
  await page.goto(`${BASE}?test&menu`,{waitUntil:'domcontentloaded',timeout:120000});
  await until(page,()=>window.__mirio&&!document.getElementById('start').disabled,null,120000);
  return {context,page,errors};
}
async function choose(page,id){await page.click(`[data-level="${id}"]`);await page.click('#start');}
async function menu(page){const s=await snap(page);if(s.state==='win')await page.click('#win-menu');else{await page.click('#pause-button');await page.click('#pause-menu');}await until(page,()=>window.__mirio.snapshot().state==='title');}
async function readyChapter(page){await until(page,()=>window.__mirio.snapshot().chapterRun?.countdown===0);}
async function fits(page,selector){
  const b=await page.locator(selector).boundingBox(),v=page.viewportSize();
  assert.ok(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,`${selector} outside ${JSON.stringify(v)}: ${JSON.stringify(b)}`);
}
try{
  const {context,page,errors}=await open({viewport:{width:1280,height:800}});
  await check('the logo and every journey choice appear without introductory copy',async()=>{
    assert.equal(await page.locator('[data-level]').count(),Object.keys(CHAPTERS).length);
    assert.ok(await page.locator('#game-logo').evaluate(img=>img.complete&&img.naturalWidth>0));
    assert.equal((await snap(page)).selectedLevel,'adventure');
    assert.equal(await page.locator('#title .intro').count(),0);
    for(const id of ['adventure','kart','sky','ribbon'])assert.ok(await page.locator(`[data-level="${id}"] img`).evaluate(img=>img.complete&&img.naturalWidth>0));
    await shot(page,'chapter-menu');
  });
  await check('help and public times are available on demand for the selected level',async()=>{
    await page.click('[data-level="sky"]');
    await page.click('#show-times');
    assert.match(await page.textContent('#title-scores-heading'),/Wolkenpost/);
    await until(page,()=>document.querySelector('#title-board li'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#scores-dialog').evaluate(el=>el.open),false);
    await page.click('#show-help');
    assert.match(await page.textContent('#chapter-keys'),/Schutzrolle/);
    await page.click('[data-close="help-dialog"]');
  });
  await check('flight countdown and pause freeze the route before the starting signal',async()=>{
    await page.click('#start');
    await until(page,()=>window.__mirio.snapshot().state==='chapter');
    await page.keyboard.press('Escape');
    const before=await snap(page);await page.waitForTimeout(350);
    assert.deepEqual((await snap(page)).chapterRun,before.chapterRun);
    assert.equal(before.chapterRun.time,0);
    assert.equal(await page.isVisible('#rescue'),false);
    await page.evaluate(()=>document.getElementById('rescue').click());
    assert.deepEqual((await snap(page)).chapterRun,before.chapterRun,'countdown rescue must not add a penalty');
    await page.click('#resume');await readyChapter(page);
  });
  await check('flight steers, rolls and boosts through the normal keyboard input path',async()=>{
    const before=(await snap(page)).chapterRun;
    await page.keyboard.down('KeyD');await gameTime(page,.5);await page.keyboard.up('KeyD');
    assert.ok((await snap(page)).chapterRun.x>before.x+.5);
    await page.keyboard.down('KeyW');await gameTime(page,.4);await page.keyboard.up('KeyW');
    assert.ok((await snap(page)).chapterRun.y>before.y+.5);
    await page.keyboard.press('Space');await until(page,()=>window.__mirio.snapshot().chapterRun.roll>0);
    await page.keyboard.press('ShiftLeft');await until(page,()=>window.__mirio.snapshot().chapterRun.boost>0);
    await shot(page,'chapter-sky');
  });
  await check('controller movement and A/X actions use the same flight rules',async()=>{
    await gameTime(page,5.1);
    const before=(await snap(page)).chapterRun.x;
    await page.evaluate(()=>{window.__testPad.connected=true;window.__testPad.axes[0]=-1;window.__testPad.buttons[0]={pressed:true,value:1};window.__testPad.buttons[2]={pressed:true,value:1};});
    await until(page,()=>window.__mirio.snapshot().chapterRun.boost>0);
    await gameTime(page,.4);
    assert.ok((await snap(page)).chapterRun.x<before-.4);
    await page.evaluate(()=>{window.__testPad.connected=false;});
  });
  await check('rescue resumes at a safe checkpoint and explains its time adjustment',async()=>{
    await page.click('#pause-button');const before=(await snap(page)).chapterRun;
    await page.click('#rescue');const after=await snap(page);
    assert.equal(after.paused,false);assert.ok(after.chapterRun.time>=before.time);
    assert.ok(after.chapterRun.penalty>before.penalty);assert.match(await page.textContent('#toast'),/\+2 s/);
  });
  await check('finishing flight saves an isolated personal best and shows a time-only result',async()=>{
    await until(page,()=>window.__mirio.snapshot().chapterRun.elapsed>=22);
    await page.evaluate(()=>window.__mirio.chapterSeek(.992));
    await until(page,()=>window.__mirio.snapshot().state==='win');
    assert.match(await page.textContent('#win-title'),/Post/);
    assert.match(await page.textContent('#win-time'),/^\d+:\d{2}\.\d{2}$/);
    assert.ok(await page.evaluate(key=>Number(localStorage.getItem(key))>0,personalBestKey('sky')));
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),personalBestKey('ribbon')),null);
    await shot(page,'chapter-result');
  });
  await check('a temporary score-server failure permits retry with the same finished run',async()=>{
    let refuse=true;let submitted=null;
    await page.route('**/api/times.php?*',async route=>{
      if(route.request().method()==='POST'){
        submitted=route.request().postDataJSON();
        if(refuse){refuse=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'unavailable',message:'Kurz offline'})});}
      }
      return route.continue();
    });
    await until(page,()=>!document.getElementById('score-form').hidden);
    await page.fill('#score-name','Wolkenkind');await page.click('#score-send');
    await until(page,()=>document.getElementById('score-status').textContent==='Kurz offline');
    assert.equal(await page.isDisabled('#score-send'),false);assert.ok(await page.isVisible('#score-form'));
    await page.click('#score-send');
    await until(page,()=>document.getElementById('score-form').hidden);
    assert.equal(submitted.level,'sky');assert.ok(Number.isInteger(submitted.timeMs));assert.equal(submitted.points,undefined);
    assert.equal(submitted.penaltyMs,Math.round((await snap(page)).chapterRun.penalty*1000));
    assert.ok(submitted.penaltyMs>=2000);
    assert.match(await page.textContent('#score-status'),/Platz|eingetragen/);
    assert.equal((await page.textContent('#win-board .mine .name'))?.trim(),'Wolkenkind');
    await page.unroute('**/api/times.php?*');
  });
  await check('replay resets the flight, while menu navigation retains the personal best',async()=>{
    await page.click('#again');const s=await snap(page);assert.equal(s.chapterRun.time,0);assert.equal(s.chapterRun.collectibles,0);
    await menu(page);assert.match(await page.textContent('[data-best="sky"]'),/\d+:\d{2}/);
  });
  await check('the side-scroller supports running, variable jumps and a helpful air spin',async()=>{
    await choose(page,'ribbon');await readyChapter(page);
    const before=(await snap(page)).chapterRun;
    await page.keyboard.down('KeyD');await gameTime(page,.8);
    assert.ok((await snap(page)).chapterRun.x>before.x+2);
    await page.keyboard.down('Space');await gameTime(page,.22);await page.keyboard.up('Space');
    assert.ok((await snap(page)).chapterRun.y>before.y+1);
    await page.keyboard.press('ShiftLeft');await gameTime(page,.1);
    assert.equal((await snap(page)).chapterRun.airSpin,false);
    await page.keyboard.up('KeyD');await shot(page,'chapter-ribbon');
  });
  await check('garden rescue preserves its room and replay clears discoveries',async()=>{
    await page.click('#pause-button');await page.click('#rescue');
    assert.equal((await snap(page)).selectedLevel,'ribbon');
    const recovered=(await snap(page)).chapterRun;
    assert.equal(recovered.seeds,0);assert.equal(recovered.status,'playing');
    assert.ok(recovered.penalties>=2);
    // Complete seed/door/finish routes are played in mirio-garden-e2e.mjs.
    await menu(page);await choose(page,'ribbon');
    assert.equal((await snap(page)).chapterRun.collectibles,0);
    assert.equal((await snap(page)).chapterRun.seeds,0);
    await menu(page);
  });
  await check('the kart has a direct menu entry and keeps its gas, steering and hop controls',async()=>{
    await choose(page,'kart');await until(page,()=>window.__mirio.snapshot().race.state==='race');
    assert.equal((await snap(page)).selectedLevel,'kart');assert.match(await page.textContent('#bits'),/\/ 77$/);
    await page.keyboard.down('ArrowUp');await until(page,()=>window.__mirio.snapshot().race.speed>8);
    await page.keyboard.down('ArrowLeft');await page.keyboard.down('Space');await until(page,()=>window.__mirio.snapshot().race.height>0.2);
    await page.keyboard.up('Space');await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowUp');
    await shot(page,'chapter-kart');await menu(page);
  });
  await check('switching from the curved kart track resets the side-scroller camera upright',async()=>{
    await choose(page,'ribbon');
    assert.deepEqual((await snap(page)).cameraUp,[0,1,0]);
    await menu(page);
  });
  await check('the full original adventure still starts with its gem total, the plane parked out of sight',async()=>{
    await choose(page,'adventure');assert.equal((await snap(page)).state,'play');assert.equal((await snap(page)).chapterRun,null);
    assert.match(await page.textContent('#bits'),/\/ 174$/);assert.equal(await page.isVisible('#ride-action'),false);
    await menu(page);assert.deepEqual(errors,[]);
  });
  await context.close();
  const mobile=await open({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await check('portrait menu keeps journey choices and Play reachable',async()=>{
    assert.equal(await mobile.page.locator('[data-level]').count(),Object.keys(CHAPTERS).length);
    for(const id of ['#game-logo','[data-level="ribbon"]','[data-level="kart"]','#start','#show-help'])await fits(mobile.page,id);
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await shot(mobile.page,'chapter-menu-phone');
  });
  await check('touch flight actions work and landscape keeps the menu reachable',async()=>{
    await mobile.page.tap('[data-level="sky"]');await mobile.page.tap('#start');await readyChapter(mobile.page);
    await mobile.page.tap('#btn-spin');await until(mobile.page,()=>window.__mirio.snapshot().chapterRun.boost>0);
    assert.equal(await mobile.page.getAttribute('#btn-jump','aria-label'),'Schutzrolle');
    await shot(mobile.page,'chapter-sky-phone');await menu(mobile.page);
    await mobile.page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
    await mobile.page.setViewportSize({width:844,height:390});
    for(const id of ['[data-level="ribbon"]','#start','#show-help'])await fits(mobile.page,id);
    await shot(mobile.page,'chapter-menu-landscape');assert.deepEqual(mobile.errors,[]);
  });
  await mobile.context.close();
}finally{await browser.close();}
console.log(`\n${results.filter(Boolean).length}/${results.length} chapter checks passed`);
process.exitCode=results.every(Boolean)?0:1;
