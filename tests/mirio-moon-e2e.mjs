// Stage authored launch points, then exercise actual drift, jumps, springs, and boss tells.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const snap=()=>page.evaluate(()=>window.__mirio.snapshot());
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:90000,polling:70});
async function gameTime(delta){const target=(await snap()).time+delta;await wait(t=>window.__mirio.snapshot().time>=t,target);}
async function placeWorld(pos){await page.evaluate(pos=>{const moon=window.__mirio.layout().planets.find(p=>p.id==='mond'),r=pos.map((v,i)=>v-moon.center[i]),length=Math.hypot(...r);window.__mirio.teleport('mond',r.map(v=>v/length),length-moon.radius);},pos);}
const raised=(p,h)=>p.pos.map((v,i)=>v+p.up[i]*h);
try{
  await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:8766/'}?test&menu`);await wait(()=>window.__mirio&&!document.querySelector('#start').disabled);await page.click('#start');
  let map=await page.evaluate(()=>window.__mirio.layout());
  await placeWorld(raised(map.moon.platforms[0],.3));await wait(()=>window.__mirio.snapshot().moon.visited.length===1);
  const before=(await snap()).player.pos;await gameTime(.6);assert.ok(Math.hypot(...(await snap()).player.pos.map((v,i)=>v-before[i]))>.1);
  await page.screenshot({path:'/tmp/moon-cloud.png'});
  // Ordinary keyboard flight tests steering and a landing on the next moving island.
  await page.evaluate(()=>{
    const keys=new Set(),key=(code,on)=>{if(keys.has(code)===on)return;on?keys.add(code):keys.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true}));};
    window.moonPilot={done:false};let previous=null,previousTime=0,start=window.__mirio.snapshot().time;
    key('Space',true);
    const frame=()=>{
      const s=window.__mirio.snapshot(),p=s.player.pos,target=window.__mirio.layout().moon.platforms[1].pos,up=s.player.up;
      if(s.moon.visited.length>=2||s.time-start>12){for(const code of [...keys])key(code,false);window.moonPilot.done=true;return;}
      let d=target.map((v,i)=>v-p[i]),dot=d.reduce((v,n,i)=>v+n*up[i],0);d=d.map((v,i)=>v-dot*up[i]);const dist=Math.hypot(...d);
      let speed=0;if(previous&&s.time>previousTime)speed=p.reduce((v,n,i)=>v+(n-previous[i])*d[i]/Math.max(dist,.01),0)/(s.time-previousTime);
      if(dist>.2)window.__mirio.aim(d);
      key('KeyW',dist>1&&speed<dist*1.6);key('KeyS',speed>dist*1.6);if(s.time-start>.75)key('Space',false);
      previous=p;previousTime=s.time;requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  });
  await wait(()=>window.moonPilot.done);assert.ok((await snap()).moon.visited.length>=2);
  map=await page.evaluate(()=>window.__mirio.layout());
  await placeWorld(raised(map.moon.guardian,.25));await wait(()=>window.__mirio.snapshot().moon.launches>0);
  await wait(()=>window.__mirio.snapshot().fight);console.log('Guardian reached arena through actual player physics');
  await wait(()=>window.__mirio.snapshot().boss.state==='crouch');const locked=(await snap()).boss.target;
  await page.keyboard.down('Space');await page.keyboard.down('KeyD');await gameTime(.2);await page.keyboard.up('KeyD');
  assert.deepEqual((await snap()).boss.target,locked);assert.equal((await snap()).boss.toys.warning,true);
  await page.screenshot({path:'/tmp/boss-warning.png'});await page.keyboard.up('Space');
  await wait(()=>window.__mirio.snapshot().boss.toys.pads.some(p=>p.charged));
  const charged=(await snap()).boss.toys.pads.findIndex(p=>p.charged),launches=(await snap()).boss.toys.launches;
  map=await page.evaluate(()=>window.__mirio.layout());await placeWorld(raised(map.boss.pads[charged],.2));
  await wait(n=>window.__mirio.snapshot().boss.toys.launches>n,launches);
  await page.screenshot({path:'/tmp/boss-spring.png'});assert.deepEqual(errors,[]);
  const returns=(await snap()).moon.launches;assert.equal((await snap()).fight,true);
  await placeWorld(raised(map.moon.guardian,.25));await gameTime(2);
  assert.ok((await snap()).moon.launches>returns,'guardian must work during arena recovery');
  console.log('Moon island jump, guardian, locked boss tell, charged spring, and fight recovery passed');
}finally{await browser.close();}
