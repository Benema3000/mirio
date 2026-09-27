import test from 'node:test';
import assert from 'node:assert/strict';
import {TILT,TiltRules} from '../js/tilt-rules.js';
import {TILT_PATHS,TILT_CHECKPOINTS,tiltFloor} from '../js/tilt-course.js';

const STEP=1/60;
function advance(run,seconds,input={}){const events=[];for(let i=0;i<seconds/STEP;i++)events.push(...run.step(STEP,input));return events;}

test('braking at the tutorial exit never requires a reverse run-up',()=>{
  const run=new TiltRules();
  for(let i=0;i<1200&&run.snapshot().y<9;i++)run.step(STEP,{y:1});
  advance(run,2,{jumpHeld:true});
  for(let i=0;i<720&&run.snapshot().y<=17;i++)run.step(STEP,{y:1});
  assert.ok(run.snapshot().y>17,`stalled at ${run.snapshot().y}`);
});

function drive(run,target){
  for(let i=0;i<1800;i++){
    const r=run.snapshot(),dx=target[0]-r.x,dy=target[1]-r.y,distance=Math.hypot(dx,dy);
    if(distance<.8&&r.speed<1||r.status==='finished')return;
    const speed=Math.min(4.8,distance*1.8),scale=speed/Math.max(.01,distance);
    const ax=(dx*scale-r.vx)*2.2+TILT.drag*r.vx,ay=(dy*scale-r.vy)*2.2+TILT.drag*r.vy;
    const angle=value=>Math.asin(Math.max(-.9,Math.min(.9,value)))/TILT.maxAngle;
    run.step(STEP,{x:angle(r.surfaceSlope.x+ax/TILT.gravity),y:angle(r.surfaceSlope.y+ay/TILT.gravity),jumpHeld:distance<.8&&r.speed>.6});
    assert.equal(run.snapshot().recoveries,0,`fell travelling to ${target}`);
  }
  assert.fail(`stalled travelling to ${target}: ${JSON.stringify(run.snapshot())}`);
}
function traverse(run,id){for(const point of TILT_PATHS.find(path=>path.id===id).points.slice(1))drive(run,point);}

test('the stick tilts gradually; releasing keeps inertia while the brake levels and settles',()=>{
  const run=new TiltRules();run.step(.05,{y:1});const first=run.snapshot();
  assert.ok(first.tiltY>0&&first.tiltY<TILT.maxAngle/2);
  advance(run,.7,{y:1});const rolling=run.snapshot();advance(run,.15,{});const released=run.snapshot();
  assert.ok(released.tiltY<rolling.tiltY);assert.ok(released.speed>rolling.speed*.8);
  advance(run,.7,{jumpHeld:true});const stopped=run.snapshot();
  assert.ok(stopped.tiltY<.001);assert.ok(stopped.speed<.4);
});

test('gravity acts on shaped slopes even with the board level',()=>{
  const run=new TiltRules();run.seek('rainbow-ribbon');
  // This crown slopes in both directions; the resting bubble rolls downhill on its own.
  const before=run.snapshot();advance(run,.25,{});const after=run.snapshot();
  assert.ok(Math.hypot(before.surfaceSlope.x,before.surfaceSlope.y)>.02);
  assert.ok(after.vx*before.surfaceSlope.x+after.vy*before.surfaceSlope.y<0);
});

test('both branches are continuous and separated by real gaps',()=>{
  for(const path of TILT_PATHS)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i];
    for(let t=0;t<=1;t+=.05)assert.ok(tiltFloor(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,{bridgeOpen:true}).distance<0,path.id);
  }
  for(const point of [[0,51],[0,98],[3,137]])assert.ok(tiltFloor(...point,{bridgeOpen:true}).distance>0,`gap ${point}`);
  assert.ok(tiltFloor(10,92).distance>0);assert.ok(tiltFloor(10,92,{bridgeOpen:true}).distance<0);
});

test('comfortable exits can climb from rest and all forward slopes fit within available tilt',()=>{
  for(const path of TILT_PATHS)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length;
    for(let t=.03;t<1;t+=.03){
      const floor=tiltFloor(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,{bridgeOpen:true});
      assert.ok(floor.slopeX*dx+floor.slopeY*dy<Math.sin(TILT.maxAngle),`uphill lip ${path.id}`);
    }
  }
});

test('checkpoint order prevents finishing by skipping rooms or falling across gaps',()=>{
  const run=new TiltRules();run.seek('basin');advance(run,.2,{jumpHeld:true});assert.equal(run.snapshot().checkpoint,0);
  run.seek('finish');advance(run,1,{jumpHeld:true});assert.equal(run.snapshot().status,'playing');
  run.rescue();assert.equal(run.snapshot().checkpoint,0);assert.equal(run.snapshot().y,4);
  for(const checkpoint of TILT_CHECKPOINTS){run.seek(checkpoint.id);run.step(STEP,{});assert.equal(run.snapshot().checkpoint,checkpoint.index);}
  run.seek('finish');advance(run,.5,{jumpHeld:true});assert.equal(run.snapshot().status,'finished');
});

test('braking grows optional foam once; existing surfaces and discoveries survive a towel catch',()=>{
  const run=new TiltRules();for(const id of ['rainbow','basin']){run.seek(id);run.step(STEP,{});}
  const before=tiltFloor(1,79),events=advance(run,1.3,{jumpHeld:true});
  assert.equal(events.filter(event=>event.type==='foam').length,1);assert.equal(run.snapshot().bridgeOpen,true);
  assert.deepEqual(tiltFloor(1,79,{bridgeOpen:true}).height,before.height);
  run.seek('lagoon-safe');const fallEvents=[];for(let i=0;i<600&&run.snapshot().recoveries===0;i++)fallEvents.push(...run.step(STEP,{x:-1}));
  const recovered=run.snapshot();assert.equal(fallEvents.filter(event=>event.type==='rescue').length,1);
  assert.equal(recovered.penalty,2);assert.equal(recovered.checkpoint,2);assert.equal(recovered.bridgeOpen,true);
  assert.equal(recovered.x,0);assert.equal(recovered.y,78);assert.ok(recovered.recovering>0);
});

test('the safe route completes without foam or catches in 45–90 seconds',()=>{
  const run=new TiltRules();for(const id of ['wash','rainbow-safe','lagoon-safe','towel-safe'])traverse(run,id);
  advance(run,1,{jumpHeld:true});const r=run.snapshot();
  assert.equal(r.status,'finished');assert.equal(r.bridgeOpen,false);assert.equal(r.shortcuts,0);
  assert.ok(r.time>=45&&r.time<=90,`safe route ${r.time}s`);assert.equal(r.progress,1);
  advance(run,1,{x:1});assert.equal(run.snapshot().time,r.time);
});

test('three narrow choices reconnect at the same checkpoints and reward careful braking',()=>{
  const run=new TiltRules();traverse(run,'wash');traverse(run,'rainbow-ribbon');
  advance(run,1.5,{jumpHeld:true});assert.equal(run.snapshot().bridgeOpen,true);
  traverse(run,'foam');traverse(run,'towel-ribbon');advance(run,1,{jumpHeld:true});const r=run.snapshot();
  assert.equal(r.status,'finished');assert.deepEqual(r.shortcutIds,['rainbow-ribbon','foam','towel-ribbon']);
  assert.ok(r.time<48);run.reset();assert.equal(run.snapshot().bridgeOpen,false);assert.equal(run.snapshot().checkpoint,0);
});

test('rejoining an island off center has no invisible seam that kicks the bubble',()=>{
  const floor=tiltFloor(.750117,75.00889,{bridgeOpen:true});
  assert.ok(Math.hypot(floor.slopeX,floor.slopeY)<.45,`basin join slope ${floor.slopeX},${floor.slopeY}`);
});
