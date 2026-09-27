import test from 'node:test';
import assert from 'node:assert/strict';
import {MARBLE, MARBLE_BELLS, MARBLE_PATHS, MARBLE_BUMPERS, MarbleRules, marbleFloor, bumperBeat} from '../js/marble-rules.js';

const stepFor=(run,time,input)=>{const events=[];for(let t=0;t<time;t+=1/120)events.push(...run.step(1/120,input));return events;};
function note(run,id){
  run.seek(id);
  return run.step(1/120,{action:true,jumpHeld:true});
}
function drive(run,target,seconds=20){
  for(let t=0;t<seconds;t+=1/120){
    const state=run.snapshot();
    const d={x:target.x-state.x,y:target.y-state.y},span=Math.hypot(d.x,d.y),speed=state.speed;
    if(span<.5&&speed<1)return;
    const wanted=Math.min(4.6,span*2),scale=wanted/Math.max(.1,span);
    run.step(1/120,{x:(d.x*scale-state.vx)*.55,y:(d.y*scale-state.vy)*.55,jumpHeld:span<1.2&&speed>1.5});
  }
  assert.fail(`did not reach ${JSON.stringify(target)} from ${JSON.stringify(run.snapshot())}`);
}

test('rolling carries inertia; brake settles it without a jump',()=>{
  const rolling=new MarbleRules();stepFor(rolling,.7,{y:1});const before=rolling.snapshot();
  stepFor(rolling,.35,{});assert.ok(rolling.snapshot().speed>before.speed*.65);
  stepFor(rolling,.35,{jumpHeld:true});assert.ok(rolling.snapshot().speed<.3);
  assert.equal(rolling.snapshot().height,0);
});

test('bells teach braking, a generous pulse collects once and carries the note',()=>{
  const run=new MarbleRules();run.seek('rose');stepFor(run,.7,{x:1});
  run.step(.01,{action:true});assert.equal(run.snapshot().notes,0);
  stepFor(run,1.3,{jumpHeld:true});
  const events=run.step(.01,{action:true,jumpHeld:true});assert.equal(events.filter(e=>e.type==='note').length,1);
  assert.equal(run.snapshot().notes,1);run.step(.01,{action:true});assert.equal(run.snapshot().notes,1);
  assert.ok(run.snapshot().cooldown>0);
});

test('all three bells can be visited in any order; only the starting drum finishes',()=>{
  for(const order of [['rose','blue','gold'],['gold','rose','blue'],['blue','gold','rose']]){
    const run=new MarbleRules();for(const id of order)note(run,id);
    assert.equal(run.snapshot().status,'playing');assert.equal(run.snapshot().finishReady,true);
    run.seek('drum');stepFor(run,.6,{jumpHeld:true});
    assert.equal(run.snapshot().status,'finished');const time=run.snapshot().time;stepFor(run,1,{y:1});assert.equal(run.snapshot().time,time);
  }
});

test('gutter and manual recovery keep notes, add one penalty, and return to a safe room',()=>{
  const run=new MarbleRules();note(run,'rose');const events=[];
  for(let t=0;t<8&&run.snapshot().recoveries===0;t+=1/120)events.push(...run.step(1/120,{x:-1}));
  assert.equal(events.filter(e=>e.type==='rescue').length,1);
  assert.equal(run.snapshot().notes,1);assert.equal(run.snapshot().penalty,MARBLE.recoveryPenalty);
  assert.ok(marbleFloor(run.snapshot().x,run.snapshot().y).distance<0);
  run.rescue();assert.equal(run.snapshot().penalty,MARBLE.recoveryPenalty*2);assert.equal(run.snapshot().notes,1);
});

test('bank and broad bends are separate continuous roads between the same rooms',()=>{
  for(const path of MARBLE_PATHS)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i];
    for(let t=0;t<=1;t+=.1)assert.ok(marbleFloor(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t).distance<0);
  }
  assert.equal(marbleFloor(0,36).bank,true);assert.equal(marbleFloor(-18,36).bank,false);
  assert.ok(marbleFloor(-9,36).distance>0,'forks must have real space between them');
});

test('cushions warn before each stronger pulse and push away without trapping',()=>{
  const bumper=MARBLE_BUMPERS[0];assert.ok(bumperBeat(3.4,bumper).anticipation>.5);assert.equal(bumperBeat(3.7,bumper).active,true);
  const run=new MarbleRules();run.seek('lesson');
  const events=run.step(.01,{}),state=run.snapshot();assert.ok(events.some(e=>e.type==='marble-bumper'));assert.ok(state.vx>0);
  assert.ok(Math.hypot(state.x-bumper.x,state.y-bumper.y)>=bumper.radius+MARBLE.radius-.001);
});

test('a complete connected board route plays in the intended time without rescue',()=>{
  const run=new MarbleRules();
  const route=[[0,18],[-10,18],[-18,29],[-20,30,'rose'],[-18,38],[-18,43],[0,54],[0,57,'gold'],
    [0,54],[18,43],[18,35],[18,29],[20,30,'blue'],[18,29],[10,18],[0,18],[0,4]];
  for(const [x,y,bell]of route){drive(run,{x,y});if(bell){stepFor(run,1.3,{jumpHeld:true});run.step(.01,{action:true,jumpHeld:true});}}
  stepFor(run,.6,{jumpHeld:true});const state=run.snapshot();
  assert.equal(state.status,'finished');assert.equal(state.notes,3);assert.equal(state.recoveries,0);
  assert.ok(state.time>35&&state.time<100,`complete route took ${state.time}s`);
});

test('bank crossing preserves a useful momentum advantage and remains recoverable',()=>{
  const run=new MarbleRules();run.seek('crossing');
  for(const target of [{x:-2,y:30},{x:2,y:42},{x:0,y:54}])drive(run,target);
  assert.ok(run.snapshot().bankTrips>0);assert.equal(run.snapshot().recoveries,0);
  run.rescue();assert.ok(marbleFloor(run.snapshot().x,run.snapshot().y).distance<0);
});
