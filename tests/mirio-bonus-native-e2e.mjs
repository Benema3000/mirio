// Full hidden-planet loop through ordinary keyboard movement and camera aiming.
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const b=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const shot = async name => {if(process.env.SHOTS)await p.screenshot({path:`${process.env.SHOTS}/${name}.png`});};
const p=await b.newPage({viewport:{width:800,height:600}}), errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8767/'}?test&menu`);await p.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:120000});
await p.click('#start');await p.waitForFunction(()=>window.__mirio.snapshot().player.onGround);
await p.evaluate(()=>{
 const held=new Set(),set=(code,on)=>{if(held.has(code)===on)return;window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));on?held.add(code):held.delete(code);};
 const dir=(lat,lon)=>{lat*=Math.PI/180;lon*=Math.PI/180;return [Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)];};
 const route=[[80,135],[74,140],[68,155],[64,180]].map(([lat,lon])=>dir(lat,lon));let index=0;
 window.discoveryWalk={done:false,index:0};
 const timer=setInterval(()=>{const state=window.__mirio.snapshot(),body=state.player,target=route[index];
  const distance=Math.acos(Math.max(-1,Math.min(1,target.reduce((sum,v,i)=>sum+v*body.up[i],0))))*26;
  if(distance<1.4){index++;window.discoveryWalk.index=index; if(index===route.length){for(const code of held)set(code,false);clearInterval(timer);window.discoveryWalk.done=true;return;}}
  const next=route[index];window.__mirio.aim(next.map((v,i)=>v*26+(body.planet==='wunderwiese'?window.__mirio.layout().planets.find(p=>p.id==='wunderwiese').center[i]:0)-body.pos[i]));set('KeyW',true);
 },60);
});
await p.waitForFunction(()=>window.discoveryWalk.done,null,{timeout:90000});
await p.waitForFunction(()=>window.__mirio.snapshot().player.onGround);
await p.keyboard.press('ShiftLeft');
await p.waitForFunction(()=>window.__mirio.snapshot().player.planet==='wunderwiese');
await p.waitForFunction(()=>window.__mirio.snapshot().player.onGround);
console.log('DISCOVERED through ordinary walking');await shot('bonus-arrival');
await p.keyboard.press('KeyF');await p.waitForFunction(()=>window.__mirio.snapshot().bonus.biplane.mounted);
await p.evaluate(()=>{
const held=new Set(),set=(code,on)=>{if(held.has(code)===on)return;window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));on?held.add(code):held.delete(code);};
window.meadowPilot={done:false,lastTask:'',log:[],phase:'fly',lastBoost:0};
const timer=setInterval(()=>{const state=window.__mirio.snapshot(),f=state.bonus.biplane,m=state.bonus.meadow,t=m.task;
if(!f.mounted){for(const code of held)set(code,false);clearInterval(timer);window.meadowPilot.done=true;return;}
if(t.id!==window.meadowPilot.lastTask){window.meadowPilot.log.push({task:t.id,time:state.time,plane:f.pos,meadow:m});window.meadowPilot.lastTask=t.id;}
const dot=t.dir.reduce((sum,v,i)=>sum+v*f.up[i],0),distance=Math.acos(Math.max(-1,Math.min(1,dot)))*26;
window.__mirio.aim(t.dir.map((v,i)=>v*26+window.__mirio.layout().planets.find(p=>p.id==='wunderwiese').center[i]-f.pos[i]));
if(t.id==='land'&&distance<1.4){set('KeyW',false);set('Space',false);if(!f.landing){set('KeyF',true);setTimeout(()=>set('KeyF',false),100);}return;}
set('KeyW',true);const altitude=t.id==='boat'?1.2:t.id==='dock'?1.8:2.7;set('Space',f.altitude<altitude);set('ShiftLeft',false);
if(t.id==='wind'&&state.time-window.meadowPilot.lastBoost>3.2){set('ShiftLeft',true);window.meadowPilot.lastBoost=state.time;}
},60);
});
await p.waitForFunction(()=>window.__mirio.snapshot().bonus.meadow.windPowered,null,{timeout:120000});await shot('meadow-wind');console.log('WIND');
await p.waitForFunction(()=>window.__mirio.snapshot().bonus.meadow.boat==='docked',null,{timeout:180000});await shot('meadow-boat');console.log('BOAT');
await p.waitForFunction(()=>window.__mirio.snapshot().bonus.meadow.kiteFlying,null,{timeout:180000});await shot('meadow-kite');console.log('KITE');
await p.waitForFunction(()=>window.meadowPilot.done,null,{timeout:180000});console.log('LANDED');await shot('meadow-landed');
await p.waitForFunction(()=>window.__mirio.snapshot().player.onGround);
await p.evaluate(()=>{
 const held=new Set(),set=(code,on)=>{if(held.has(code)===on)return;window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));on?held.add(code):held.delete(code);};
 window.meadowWalker={done:false,jumpAt:-10};
 const timer=setInterval(()=>{const state=window.__mirio.snapshot(),m=state.bonus.meadow,body=state.player,t=m.task;
  if(m.celebration){for(const key of held)set(key,false);clearInterval(timer);window.meadowWalker.done=true;return;}
  const distance=Math.acos(Math.max(-1,Math.min(1,t.dir.reduce((sum,v,i)=>sum+v*body.up[i],0))))*26;
  window.__mirio.aim(t.dir.map((v,i)=>v*26+(body.planet==='wunderwiese'?window.__mirio.layout().planets.find(p=>p.id==='wunderwiese').center[i]:0)-body.pos[i]));set('KeyW',true);
  if(body.onGround&&distance<4.5&&state.time-window.meadowWalker.jumpAt>1.1){set('Space',true);window.meadowWalker.jumpAt=state.time;}
  else if(state.time-window.meadowWalker.jumpAt>.65)set('Space',false);
 },60);
});
await p.waitForFunction(()=>window.meadowWalker.done,null,{timeout:180000});
await shot('meadow-picnic');console.log('PICNIC');
await p.evaluate(()=>{const target=window.__mirio.layout().bonus.meadow.spring.dir,body=window.__mirio.snapshot().player;window.__mirio.aim(target.map((v,i)=>v*26+(body.planet==='wunderwiese'?window.__mirio.layout().planets.find(p=>p.id==='wunderwiese').center[i]:0)-body.pos[i]));});
await p.keyboard.down('KeyW');await p.waitForFunction(()=>window.__mirio.snapshot().bonus.meadow.springUses>0,null,{timeout:60000});await p.keyboard.up('KeyW');
await p.waitForFunction(()=>window.__mirio.snapshot().player.height>5);await shot('meadow-spring');
await p.waitForFunction(()=>window.__mirio.snapshot().player.onGround,null,{timeout:60000});
if((await p.evaluate(()=>window.__mirio.snapshot().splashes))!==0)throw new Error('The default spring landing must stay dry');
console.log('SPRING safe landing');
await p.click('#pause-button');await p.click('#rescue');await p.waitForFunction(()=>!window.__mirio.snapshot().paused);
console.log('RECOVERY');
if(!(await p.evaluate(()=>window.__mirio.snapshot().bonus.meadow.celebration)))throw new Error('Recovery lost meadow discoveries');
if(errors.length)throw new Error(errors.join('\n'));
console.log('PASS discovery walk, plane flight, bridge, guide, picnic, spring, recovery');
}catch(e){console.log('FAIL STATE',await p.evaluate(()=>({s:window.__mirio.snapshot(),pilot:window.meadowPilot,walker:window.meadowWalker})));await shot('meadow-failure');throw e;}finally{await b.close();}
