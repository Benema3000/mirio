import test from 'node:test';
import assert from 'node:assert/strict';
import {MARBLE,MARBLE_BELLS,MARBLE_FLIPPERS,MarbleRules,PINBALL_PHASE,flipperSegment} from '../js/marble-rules.js';

const HZ=120,FRAME=1/HZ;
function stepFor(run,seconds,input={}){
  const events=[];for(let i=0;i<Math.ceil(seconds*HZ);i++)events.push(...run.step(FRAME,input));return events;
}
function launch(run,charge=.85){stepFor(run,charge,{jumpHeld:true});return run.step(FRAME,{});}
function light(run,id){run.seek(id);return run.step(FRAME,{});}
function play(run,limit=200,hold='timed'){
  const events=[];
  for(let i=0;i<limit*HZ&&run.snapshot().status==='playing';i++){
    const s=run.snapshot(),flip=hold==='held'||s.y<11&&s.vy<0;
    events.push(...run.step(FRAME,{jumpHeld:s.served&&s.plungerCharge<.85,
      flipperLeft:!s.served&&flip,flipperRight:!s.served&&flip}));
  }
  return events;
}

test('a side plunger charges while held and launches only on release',()=>{
  const run=new MarbleRules();stepFor(run,1,{x:1,y:1});assert.equal(run.snapshot().phase,PINBALL_PHASE.SERVE);
  const events=stepFor(run,.6,{jumpHeld:true}),charged=run.snapshot();
  assert.equal(charged.speed,0);assert.ok(charged.plungerCharge>.6);assert.equal(events.length,0);
  const released=run.step(FRAME,{});assert.ok(released.some(e=>e.type==='spring'));
  assert.equal(run.snapshot().launches,1);assert.ok(run.snapshot().vy>MARBLE.launchMin);
});

test('a short plunger tap reaches the table; full charge gives a stronger launch',()=>{
  const short=new MarbleRules(),long=new MarbleRules();launch(short,FRAME);launch(long,1);
  assert.ok(long.snapshot().vy>short.snapshot().vy+5);
  stepFor(short,4);assert.equal(short.snapshot().served,false);assert.notEqual(short.snapshot().x,13);
});

test('the ball obeys gravity, with no directional steering acceleration',()=>{
  const still=new MarbleRules(),steered=new MarbleRules();launch(still);launch(steered);
  stepFor(still,1);stepFor(steered,1,{x:1,y:1});
  assert.equal(still.snapshot().vx,steered.snapshot().vx);assert.equal(still.snapshot().vy,steered.snapshot().vy);
  assert.ok(still.snapshot().vy<MARBLE.launchMax-8);
});

test('left and right bats move independently and can be pressed together',()=>{
  const run=new MarbleRules();stepFor(run,.1,{flipperLeft:true});let s=run.snapshot();
  assert.equal(s.flipperLeft,true);assert.equal(s.flipperRight,false);
  assert.ok(s.flipperAngles.left>0);assert.equal(s.flipperAngles.right,MARBLE.flipperRest);
  stepFor(run,.1,{flipperLeft:true,flipperRight:true});s=run.snapshot();
  assert.equal(s.flipperLeft,true);assert.equal(s.flipperRight,true);
  stepFor(run,.1);assert.equal(run.snapshot().flipperAngles.left,MARBLE.flipperRest);
});

test('a timed flipper contact sends the ball up-table and across from the correct side',()=>{
  for(const side of ['left','right']){
    const run=new MarbleRules();run.seek(side);
    const events=stepFor(run,.18,{[side==='left'?'flipperLeft':'flipperRight']:true}),s=run.snapshot();
    assert.ok(events.some(e=>e.type==='flipper-hit'&&e.side===side));assert.ok(s.vy>20);
    assert.equal(Math.sign(s.vx),side==='left'?1:-1);
  }
});

test('released bats leave a real central drain while held bats offer a broad catch',()=>{
  const left=MARBLE_FLIPPERS[0],rest=flipperSegment(left,MARBLE.flipperRest),raised=flipperSegment(left,MARBLE.flipperRaised);
  assert.ok(Math.abs(rest.bx)>MARBLE.radius+MARBLE.flipperRadius);
  assert.ok(Math.abs(raised.bx)<MARBLE.radius+MARBLE.flipperRadius);
  const run=new MarbleRules();run.seek('drain');const events=stepFor(run,.2);
  assert.equal(events.filter(e=>e.type==='rescue').length,1);assert.equal(run.snapshot().served,true);
});

test('targets light on impact once, then unfold a persistent flower',()=>{
  const run=new MarbleRules(),id=MARBLE_BELLS[0].id;
  assert.equal(light(run,id).filter(e=>e.type==='note').length,1);assert.equal(run.snapshot().notes,1);
  assert.equal(light(run,id).filter(e=>e.type==='note').length,0);assert.equal(run.snapshot().notes,1);
});

test('drains and manual recovery keep room progress and cost exactly two seconds',()=>{
  const run=new MarbleRules();run.seek(.5);const before=run.snapshot();run.seek('drain');stepFor(run,.2);
  const after=run.snapshot();assert.equal(after.table,before.table);assert.deepEqual(after.noteIds,before.noteIds);
  assert.equal(after.penalty,MARBLE.recoveryPenalty);assert.equal(after.recoveries,1);assert.equal(after.served,true);
  run.rescue();assert.equal(run.snapshot().penalty,2*MARBLE.recoveryPenalty);assert.deepEqual(run.snapshot().noteIds,before.noteIds);
});

test('a nudge has a cooldown and never replaces gravity or flippers',()=>{
  const run=new MarbleRules();launch(run);stepFor(run,3);const events=run.step(FRAME,{action:true});
  assert.equal(events.filter(e=>e.type==='ring').length,1);assert.ok(run.snapshot().cooldown>2.9);
  assert.equal(stepFor(run,1,{action:true}).filter(e=>e.type==='ring').length,0);
});

test('zero or invalid dt cannot advance physics, charge a plunger or consume input',()=>{
  const run=new MarbleRules(),before=run.snapshot();for(const dt of [0,-1,Infinity,NaN])run.step(dt,{jumpHeld:true,action:true});
  assert.deepEqual(run.snapshot(),before);
});

test('three complete tables finish through ordinary plunger and flipper controls',()=>{
  for(const strategy of ['timed','held']){
    const run=new MarbleRules(),events=play(run,200,strategy),s=run.snapshot();
    assert.equal(s.status,'finished',`${strategy}: ${JSON.stringify(s)}`);assert.equal(s.notes,9);assert.equal(s.table,2);
    assert.equal(events.filter(e=>e.type==='checkpoint').length,2);assert.equal(events.filter(e=>e.type==='finish').length,1);
    assert.ok(s.flips>3);assert.ok(s.bumps>8);assert.equal(s.recoveries,0);assert.ok(s.time>45&&s.time<180);
    const finished=run.snapshot();stepFor(run,1,{jumpHeld:true});assert.deepEqual(run.snapshot(),finished);
  }
});


test('held flippers avoid repeating dead-end bounces at common frame rates',()=>{
  for(const hz of [30,60,90,120,144]){
    const run=new MarbleRules();
    for(let i=0;i<hz*150&&run.snapshot().status==='playing';i++){
      const s=run.snapshot();run.step(1/hz,{jumpHeld:s.served&&s.plungerCharge<.9,flipperLeft:true,flipperRight:true});
    }
    assert.equal(run.snapshot().status,'finished',`${hz}Hz ${JSON.stringify(run.snapshot())}`);
    assert.equal(run.snapshot().recoveries,0);
  }
});

test('reset clears completed rooms, lit targets, penalties and held bats',()=>{
  const run=new MarbleRules();run.seek(.99);stepFor(run,.3);assert.equal(run.snapshot().status,'finished');
  run.reset();const s=run.snapshot();assert.equal(s.notes,0);assert.equal(s.table,0);assert.equal(s.time,0);
  assert.equal(s.flipperLeft,false);assert.equal(s.status,'playing');assert.equal(s.served,true);
});
