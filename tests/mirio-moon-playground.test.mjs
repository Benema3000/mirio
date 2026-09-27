import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Vector3,Quaternion} from 'three';
import {makeLevel,collidersFor} from '../js/level.js';
import {MoonPlayground} from '../js/moon-playground.js';
import {BossToys} from '../js/boss-toys.js';
import {stepBody} from '../js/world.js';

const DT=1/120;
function setup(){const level=makeLevel(),colliders=collidersFor(level),toys=new MoonPlayground(new Scene(),level,colliders);return{level,colliders,toys};}
function playerAt(pos,up,planet){
  return {state:'play',pounding:false,body:{pos:new Vector3(...pos),up:new Vector3(...up),vel:new Vector3(),onGround:true,planet,radius:.45,height:2.1},
    bounce(options){this.launch=options;this.body.vel.copy(this.body.up).multiplyScalar(options.speed);this.body.onGround=false;}};
}

test('moon islands form an optional drifting route and preserve original floor colliders',()=>{
  const level=makeLevel(),colliders=collidersFor(level),moon=level.planets[1],before=colliders(moon).slice();
  const toys=new MoonPlayground(new Scene(),level,colliders),layout=toys.layout();
  assert.equal(layout.platforms.length,6);assert.equal(colliders(moon).length,before.length+7);
  assert.deepEqual(colliders(moon).slice(0,before.length),before);
  for(const p of layout.platforms)assert.ok(p.radius>=2.5);
  toys.step(1,null);assert.notDeepEqual(toys.layout().platforms[0].pos,layout.platforms[0].pos);
});

test('grounded riders follow drift and ring each moon lantern only once',()=>{
  const {level,toys}=setup(),island=toys.layout().platforms[0],player=playerAt(island.pos,island.up,level.planets[1]);
  const events=[];for(let i=0;i<120;i++)events.push(...toys.step(DT,player));
  assert.ok(player.body.pos.distanceTo(new Vector3(...toys.layout().platforms[0].pos))<1e-8);
  assert.equal(events.filter(event=>event.kind==='moonCloud').length,1);assert.equal(toys.snapshot().visited.length,1);
  const before=toys.layout();toys.step(1,player,{active:false});assert.deepEqual(toys.layout(),before);
  toys.reset();assert.equal(toys.snapshot().visited.length,0);
});

test('moon guardian launches toward the arena using the ordinary spring API',()=>{
  const {level,toys,colliders}=setup(),g=toys.layout().guardian,player=playerAt(g.pos,g.up,level.planets[1]);
  assert.equal(toys.step(DT,player)[0].kind,'moonGuardian');assert.ok(player.launch.speed>14);
  const target=new Vector3(...g.target),initial=player.body.pos.distanceTo(target);let nearest=initial;
  // Use the real spherical gravity/collision layer throughout the launch arc.
  for(let i=0;i<300;i++){
    const rising=player.body.vel.dot(player.body.up)>0;
    stepBody(player.body,null,0,level.planets,colliders,DT,{gravityScale:rising?player.launch.gravityScale:1.5});
    nearest=Math.min(nearest,player.body.pos.distanceTo(target));
  }
  assert.ok(nearest<5.8,`guardian missed arena: ${nearest}`);assert.equal(toys.snapshot().launches,1);
});

function arenaSetup(){
  const scene=new Scene(),arena={planet:{id:'moon'},center:new Vector3(),up:new Vector3(0,1,0),radius:6.5},colliders=[];
  const toys=new BossToys(scene,arena,new Quaternion(),()=>colliders);
  const boss={state:'chase',x:0,z:0,target:{x:2,z:1},leap:{x1:2,z1:1},wave:{active:false,radius:0,x:0,z:0},toWorld(x,z,h,out){return out.set(x,h,z);}};
  return {toys,boss,arena,colliders};
}

test('arena pads charge from a shockwave, spring a rider toward the cap, and reset cleanly',()=>{
  const {toys,boss,arena,colliders}=arenaSetup(),pad=toys.layout()[0];assert.equal(colliders.length,3);
  const player=playerAt(pad.pos,pad.up,arena.planet),position={x:pad.pos[0],z:pad.pos[2],h:pad.pos[1]};
  boss.wave={active:true,x:0,z:0,radius:4};const events=[];
  toys.update(DT,boss,position,player,events);assert.equal(events[0].kind,'arenaPad');assert.ok(player.body.vel.y>10);
  assert.ok(player.body.vel.z<0,'the spring gently guides the player toward the boss');
  assert.ok(toys.snapshot().pads.some(p=>p.charged));toys.reset();assert.equal(toys.snapshot().pads.some(p=>p.charged),false);
});

test('a ground pound can play an uncharged pad, but idle pads cannot launch or hurt',()=>{
  const {toys,boss,arena}=arenaSetup(),pad=toys.layout()[0],player=playerAt(pad.pos,pad.up,arena.planet);
  const p={x:pad.pos[0],z:pad.pos[2],h:pad.pos[1]},events=[];
  toys.update(DT,boss,p,player,events);assert.equal(events.length,0);
  player.pounding=true;toys.update(DT,boss,p,player,events);assert.equal(events.length,1);
  toys.reset();boss.state='idle';player.body.vel.set(0,0,0);toys.update(DT,boss,p,player,events);assert.equal(events.length,1);
});

test('a pound that lands between physics samples still plays an uncharged arena pad',()=>{
  const {toys,boss,arena}=arenaSetup(),pad=toys.layout()[0],player=playerAt(pad.pos,pad.up,arena.planet);
  player.events=[{type:'pound',pos:player.body.pos.clone()}];
  const events=[];toys.update(DT,boss,{x:pad.pos[0],z:pad.pos[2],h:pad.pos[1]},player,events);
  assert.equal(events[0]?.kind,'arenaPad');
});

test('moon scenery culls by distance and horizon while its collision route remains intact',()=>{
  const level=makeLevel(),scene=new Scene(),colliders=collidersFor(level),moon=level.planets[1];
  const toys=new MoonPlayground(scene,level,colliders),count=colliders(moon).length,island=toys.layout().platforms[0],up=new Vector3(...island.up);
  toys.update(0,{position:moon.center.clone().addScaledVector(up,100)});assert.ok(scene.children.every(group=>!group.visible));
  toys.update(0,{position:new Vector3(...island.pos).addScaledVector(up,10)});assert.equal(scene.children[0].visible,true);
  toys.update(0,{position:moon.center.clone().addScaledVector(up,-16)});assert.equal(scene.children[0].visible,false);
  assert.equal(colliders(moon).length,count);
});
