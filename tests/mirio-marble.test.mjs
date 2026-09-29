import test from 'node:test';
import assert from 'node:assert/strict';
import {MARBLE,MARBLE_BELLS,MARBLE_FLIPPERS,MARBLE_TOYS,MARBLE_GUIDES,MarbleRules,PINBALL_PHASE,flipperSegment} from '../js/marble-rules.js';

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

test('each table has a distinct elevated shot and physical guide layout',()=>{
  assert.equal(MARBLE_TOYS?.length,3);
  for(const toy of MARBLE_TOYS){
    assert.ok(toy.path.some(point=>point.height>2));
    assert.deepEqual(toy.path[0],{x:toy.mouth.x,y:toy.mouth.y,height:0});
    assert.equal(toy.path.at(-1).height,0);
    assert.ok(MARBLE_GUIDES.some(guide=>guide.table===toy.table));
  }
});

test('a vine shot raises the ball, awards a note and keeps its growth after rescue',()=>{
  const run=new MarbleRules();light(run,'rose-0');run.seek('vine');
  const start=stepFor(run,.1),riding=run.snapshot();
  assert.equal(start.filter(event=>event.type==='pinball-toy'&&event.stage==='start').length,1);
  assert.equal(riding.toy.active,true);assert.ok(riding.height>0);
  const paused=run.snapshot();run.step(0,{action:true});assert.deepEqual(run.snapshot(),paused);
  const end=stepFor(run,3),complete=run.snapshot();
  assert.equal(end.filter(event=>event.type==='pinball-toy'&&event.stage==='complete').length,1);
  assert.equal(complete.toy.completions,1);assert.ok(complete.notes>=2);assert.ok(complete.saveTime>5);
  run.rescue();assert.equal(run.snapshot().toy.completions,1);assert.equal(run.snapshot().toy.active,false);
  assert.equal(run.snapshot().height,0);assert.equal(run.snapshot().toy.ready,true);
  run.reset();assert.equal(run.snapshot().toy.completions,0);assert.equal(run.snapshot().toy.ready,false);
});

test('toy events carry table positions and captures ignore live flipper forces',()=>{
  const first=new MarbleRules(),second=new MarbleRules();
  for(const run of [first,second]){light(run,'rose-0');run.seek('vine');run.step(FRAME,{});}
  const events=stepFor(first,.8,{flipperLeft:true,action:true});stepFor(second,.8,{});
  for(const key of ['x','y','height'])assert.equal(first.snapshot()[key],second.snapshot()[key]);
  assert.ok(events.every(event=>Number.isFinite(event.x)&&Number.isFinite(event.y)&&event.table===0));
});

test('one held flipper cradles; release timing aims the next stroke',()=>{
  const shots=[];
  for(const delay of [.05,.2]){
    const run=new MarbleRules();stepFor(run,.5,{flipperLeft:true});run.seek('left');
    const caught=stepFor(run,.4,{flipperLeft:true});
    assert.equal(run.snapshot().cradled,'left');
    assert.equal(caught.filter(event=>event.type==='pinball-cradle'&&event.stage==='catch').length,1);
    const before=run.snapshot(),rest=stepFor(run,3,{flipperLeft:true});
    assert.equal(rest.filter(event=>event.type==='pinball-cradle').length,0);
    assert.equal(run.snapshot().x,before.x);assert.equal(run.snapshot().y,before.y);
    stepFor(run,delay,{});assert.equal(run.snapshot().cradled,null);
    const shot=stepFor(run,.3,{flipperLeft:true});
    assert.ok(shot.some(event=>event.type==='flipper-hit'&&event.strong));assert.ok(run.snapshot().vy>20);
    shots.push(run.snapshot().vx);
  }
  assert.ok(shots[0]-shots[1]>1.5,`early ${shots[0]}, late ${shots[1]}`);
});

test('a second held flipper releases a cradle into the forgiving two-bat mode',()=>{
  const run=new MarbleRules();stepFor(run,.5,{flipperLeft:true});run.seek('left');
  stepFor(run,.4,{flipperLeft:true});assert.equal(run.snapshot().cradled,'left');
  stepFor(run,.3,{flipperLeft:true,flipperRight:true});
  assert.equal(run.snapshot().cradled,null);assert.ok(run.snapshot().speed>0);
  run.rescue();assert.equal(run.snapshot().cradled,null);assert.equal(run.snapshot().served,true);
});

test('clock scoop telegraphs its opening and stays open after the target bank drops',()=>{
  const run=new MarbleRules();stepFor(run,3);light(run,'blue-0');
  assert.equal(run.snapshot().toy.ready,true);assert.equal(run.snapshot().toy.open,false);
  run.seek('cuckoo');assert.equal(run.step(FRAME,{}).some(event=>event.type==='pinball-toy'),false);
  assert.ok(run.snapshot().vy<0,'the closed cuckoo door rebounds the shot');
  while(!run.snapshot().toy.open)run.step(FRAME,{});
  run.seek('cuckoo');assert.ok(run.step(FRAME,{}).some(event=>event.type==='pinball-toy'&&event.stage==='start'));
  run.rescue();light(run,'blue-1');light(run,'blue-2');
  for(let i=0;i<5*HZ;i++){run.step(FRAME,{});assert.equal(run.snapshot().toy.open,true);}
});

test('each elevated finishing branch awards the last target and reaches its bell once',()=>{
  for(const [table,id,prefix]of [[0,'vine','rose'],[1,'cuckoo','blue'],[2,'orbit','gold']]){
    const run=new MarbleRules();run.seek(table/3);light(run,`${prefix}-0`);light(run,`${prefix}-1`);
    while(!run.snapshot().toy.open)run.step(FRAME,{});
    run.seek(id);const events=stepFor(run,5);
    assert.equal(events.filter(event=>event.type==='pinball-toy'&&event.stage==='complete').length,1);
    assert.equal(run.snapshot().toyCompletions[table],1);assert.equal(run.snapshot().notes,(table+1)*3);
    assert.equal(events.filter(event=>event.type===(table===2?'finish':'checkpoint')).length,1);
  }
});

test('ordinary plunger and held flippers can reach all three optional toys',()=>{
  const run=new MarbleRules(),toys=new Set(),hz=60;
  for(let i=0;i<hz*150&&run.snapshot().status==='playing';i++){
    const s=run.snapshot();
    for(const event of run.step(1/hz,{jumpHeld:s.served&&s.plungerCharge<.85,
      flipperLeft:!s.served,flipperRight:!s.served})){
      if(event.type==='pinball-toy'&&event.stage==='complete')toys.add(event.id);
    }
  }
  assert.equal(run.snapshot().status,'finished');assert.deepEqual([...toys].sort(),['cuckoo','orbit','vine']);
  assert.equal(run.snapshot().toyShots,3);assert.equal(run.snapshot().recoveries,0);
});

test('quick target combinations extend the saver and report their highest chain',()=>{
  const run=new MarbleRules();light(run,'rose-0');const events=light(run,'rose-1');
  assert.equal(events.filter(event=>event.type==='pinball-combo'&&event.combo===2).length,1);
  assert.equal(run.snapshot().maxCombo,2);assert.ok(run.snapshot().saveTime>5);
  light(run,'rose-2');assert.equal(run.snapshot().maxCombo,3);assert.ok(run.snapshot().saveTime>8);
  run.rescue();stepFor(run,7);assert.equal(run.snapshot().combo,0);assert.equal(run.snapshot().maxCombo,3);
  run.reset();assert.equal(run.snapshot().maxCombo,0);
});

test('recovering during a captured path cancels its delayed reward',()=>{
  const run=new MarbleRules();light(run,'rose-0');run.seek('vine');stepFor(run,.5);
  assert.equal(run.snapshot().toy.active,true);run.rescue();const events=stepFor(run,4);
  assert.equal(events.filter(event=>event.type==='pinball-toy').length,0);
  assert.equal(run.snapshot().height,0);assert.equal(run.snapshot().notes,1);
  assert.equal(run.snapshot().toyShots,0);assert.equal(run.snapshot().served,true);
});
