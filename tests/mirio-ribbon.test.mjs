import test from 'node:test';
import assert from 'node:assert/strict';
import { RIBBON, RibbonRules, makeRibbonCourse, platformAt } from '../js/ribbon-rules.js';
const DT=1/120;
function run(body,seconds,input={},dt=DT){const events=[];for(let t=0;t<seconds-1e-9;t+=dt)events.push(...body.step(Math.min(dt,seconds-t),typeof input==='function'?input(body,t):input));return events;}
function flat(){const course=makeRibbonCourse();course.platforms=[{id:'ground-0',x:20,y:0,w:60,kind:'ground'}];course.springs=[];course.critters=[];course.gems=[];return new RibbonRules(course);}

test('running is responsive, braking stops promptly, and invalid time is harmless',()=>{
  const p=flat();run(p,.3,{x:1});assert.equal(p.vx,RIBBON.speed);assert.ok(p.x>6);
  run(p,.2);assert.equal(p.vx,0);assert.equal(p.y,0);const s=p.snapshot();
  for(const dt of [0,-1,NaN,Infinity])assert.deepEqual(p.step(dt,{jump:true}),[]);
  assert.deepEqual(p.snapshot(),s);
});
test('full jumps go higher than released jumps and land once',()=>{
  function jump(held){const p=flat();let peak=0;const e=p.step(DT,{jump:true,jumpHeld:held});e.push(...run(p,1.4,(p)=>{peak=Math.max(peak,p.y);return{jumpHeld:held};}));return{p,peak,e};}
  const full=jump(true),short=jump(false);assert.ok(full.peak>2.7&&full.peak<2.9);assert.ok(short.peak<1.85);
  assert.equal(full.p.grounded,true);assert.equal(full.e.filter(e=>e.type==='jump').length,1);assert.equal(full.e.filter(e=>e.type==='land').length,1);
});
test('coyote jump works after walking off a ledge but expires',()=>{
  for(const [delay,expected] of [[.06,true],[.19,false]]){
    const p=flat();p.x=50.35;p.vx=RIBBON.speed;p.grounded=false;p.support=null;
    run(p,delay,{x:1});const e=p.step(DT,{x:1,jump:true,jumpHeld:true});assert.equal(e.some(e=>e.type==='jump'),expected);
  }
});
test('a jump pressed just before landing is buffered and executes on contact',()=>{
  const p=flat();p.y=.35;p.vy=-6;p.grounded=false;p.coyote=0;
  const e=p.step(.1,{jump:true,jumpHeld:true});assert.ok(e.some(e=>e.type==='jump'&&e.buffered));assert.ok(p.vy>9);assert.ok(p.y>0);
});
test('air spin is available once per airtime and restored after landing',()=>{
  const p=flat();p.step(DT,{jump:true,jumpHeld:true});const first=p.step(DT,{action:true,x:1});
  assert.equal(first.filter(e=>e.kind==='spin').length,1);assert.equal(p.airSpin,false);
  assert.equal(p.step(DT,{action:true,x:1}).length,0);run(p,2);assert.equal(p.grounded,true);assert.equal(p.airSpin,true);
});
test('riding a moving cloud carries the player without jitter or repeated landing events',()=>{
  const p=flat(),cloud={id:'rider',x:5,y:2,w:5,kind:'cloud',move:{axis:'x',amplitude:1.6,period:4,phase:0}};
  p.course.platforms.push(cloud);p.x=5;p.y=2;p.grounded=true;p.support=cloud.id;
  const e=run(p,1);assert.ok(Math.abs(p.x-platformAt(cloud,p.clock).x)<1e-8);assert.equal(p.y,2);assert.equal(e.filter(e=>e.type==='land').length,0);
});
test('springs launch without held jump and do not repeat while departing',()=>{
  const p=flat();p.course.springs=[{id:'spring',x:5,y:0,boost:16.7}];
  const e=run(p,.55);assert.equal(e.filter(e=>e.type==='spring').length,1);assert.ok(p.y>4.7);
});
test('collectibles and checkpoints only award once; cloud rescue retains gems with a small explicit penalty',()=>{
  const p=flat();p.course.gems=[{id:'one',x:5,y:1}];p.course.checkpoints=[{id:'a',x:5,y:0,index:0},{id:'b',x:8,y:0,index:1}];
  let events=run(p,.65,{x:1});assert.equal(events.filter(e=>e.type==='bit').length,1);assert.equal(p.checkpoint,1);
  const before=p.time;p.y=-9;events=p.step(DT);assert.ok(events.some(e=>e.kind==='recovery'));
  assert.equal(p.x,8);assert.equal(p.collected.size,1);assert.equal(p.penalties,2);assert.ok(p.time>=before+2);
  run(p,1);assert.equal(p.recovery,0);assert.equal(p.recoveries,1);
});
test('all authored main-route gaps can be completed by ordinary held jumps without spin',()=>{
  const p=new RibbonRules();let jumpHeldUntil=0,events=[],safety=0;
  while(p.status==='playing'&&p.time<100&&safety++<13000){
    let jump=false;
    if(p.grounded){const support=p.course.platforms.find(q=>q.id===p.support);if(support?.kind==='ground'&&support.x+support.w/2-p.x<1.5){jump=true;jumpHeldUntil=p.clock+.82;}}
    events.push(...p.step(DT,{x:1,jump,jumpHeld:p.clock<jumpHeldUntil}));
  }
  assert.equal(p.status,'finished',JSON.stringify(p.snapshot()));assert.equal(p.recoveries,0);assert.ok(p.time>45&&p.time<90);
  assert.ok(p.collected.size>35);assert.equal(events.filter(e=>e.type==='finish').length,1);
});
test('upper-route players activate checkpoints and friendly critters never remove gems',()=>{
  const p=new RibbonRules();p.x=112;p.y=5;p.grounded=false;p.coyote=0;
  assert.ok(p.step(DT).some(e=>e.type==='checkpoint'));assert.equal(p.checkpoint,2);
  const c=p.course.critters[0];p.x=c.x+Math.sin(p.clock*c.speed+c.phase)*c.range;p.y=c.y;p.collected.add('kept');p.invulnerable=0;
  const e=p.step(DT);assert.ok(e.some(e=>e.type==='bump'&&e.friendly));assert.ok(p.vy>0);assert.ok(p.collected.has('kept'));assert.equal(p.penalties,0);
});
test('30/60/120Hz runs agree and seek cannot grant items or finish a run',()=>{
  const positions=[];
  for(const dt of [1/30,1/60,1/120]){const p=flat();run(p,2,{x:1,jumpHeld:true},dt);positions.push(p.x);assert.ok(Number.isFinite(p.time));}
  assert.ok(Math.max(...positions)-Math.min(...positions)<.03);
  const p=new RibbonRules();p.seek(1);assert.equal(p.status,'playing');assert.ok(p.x<RIBBON.finishX);assert.equal(p.collected.size,0);assert.equal(p.checkpoint,0);assert.equal(p.time,0);
  const events=run(p,1,{x:1});assert.equal(events.filter(e=>e.type==='finish').length,1);const time=p.time;run(p,2,{x:1,jump:true});assert.equal(p.time,time);
});
