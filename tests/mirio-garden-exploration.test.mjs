import test from 'node:test';
import assert from 'node:assert/strict';
import { RibbonRules, platformAt } from '../js/ribbon-rules.js';
import { GARDEN } from '../js/garden-course.js';

const DT=1/120;
function reach(r,x,y,limit=18){
  for(let t=0;t<limit;t+=DT){
    if(r.status==='finished')return;
    const dx=x-r.x;
    if(Math.abs(dx)<.28&&r.grounded&&(Math.abs(r.y-y)<.4||r.support==='blanket-lift')){r.step(.1);return;}
    r.step(DT,{x:Math.max(-1,Math.min(1,(dx-r.vx*.12)*2)),jump:r.grounded&&(r.y<y-.3||y>0&&Math.abs(r.y-y)<.4&&Math.abs(dx)>2)&&Math.abs(dx)<7.1,jumpHeld:true});
  }
  assert.fail(`Unreachable ${x},${y}: ${JSON.stringify(r.snapshot())}`);
}
function walkPath(r,path){for(const [x,y]of path)reach(r,x,y);}
const orchard=[[-27,2],[-36,3.7],[-45,5.4],[-54,7.1],[-64,8.4]];
const finalStairs=[[10,2],[19,4],[10,6],[19,8],[10,10],[19,12]];
function action(r){return r.step(DT,{action:true});}
function settle(r,seconds=1){for(let t=0;t<seconds;t+=DT)r.step(DT);}

test('an ordinary-jump loop explores three regions, reconnects, and climbs the courtyard finale',()=>{
  const r=new RibbonRules();walkPath(r,orchard);assert.equal(r.seeds.size,1);
  reach(r,-74,8.4);assert.ok(action(r).some(e=>e.kind==='door'));settle(r);
  reach(r,94,8.4);assert.equal(r.seeds.size,2);
  walkPath(r,[[113,0],[109,0]]);action(r);settle(r);
  walkPath(r,[[155,1.7],[164,3.4]]);assert.equal(r.seeds.size,3);
  assert.equal(r.status,'playing','three seeds open the ascent rather than ending exploration');
  reach(r,125,0);action(r);settle(r);walkPath(r,finalStairs);
  assert.equal(r.status,'finished');assert.equal(r.recoveries,0);assert.equal(r.snapshot().progress,1);
  assert.equal(r.discovered.size,4);assert.equal(r.snapshot().shortcuts,3);
  const time=r.time;r.step(1,{x:1,jump:true});assert.equal(r.time,time);
});

test('conservatory can be climbed in either musical state without spin',()=>{
  for(const dream of [GARDEN.dreamAwake,GARDEN.dreamAsleep]){
    const r=new RibbonRules();reach(r,49,0);
    if(dream===GARDEN.dreamAwake)assert.ok(action(r).some(e=>e.kind==='song'));
    const steps=r.course.platforms.filter(p=>p.dream===dream&&p.x<100);
    if(dream===GARDEN.dreamAsleep)steps.push({x:103,y:8.4});
    for(const p of steps)reach(r,p.x,p.y);
    reach(r,94,8.4);assert.ok(r.seeds.has('glass-seed'));assert.equal(r.recoveries,0);
  }
});

test('song changes the room safely and rescue preserves seeds, shortcuts, and song state',()=>{
  const r=new RibbonRules();reach(r,49,0);action(r);
  const awake=r.course.platforms.find(p=>p.kind==='vine'&&!p.gate),asleep=r.course.platforms.find(p=>p.kind==='ghost');
  assert.ok(r.platformActive(awake));assert.equal(r.platformActive(asleep),false);
  r.seeds.add('glass-seed');r.opened.add('curtain');r.opened.add('stump');
  r.y=-9;r.step(DT);assert.equal(r.recoveries,1);assert.equal(r.checkpoint,2);
  assert.equal(r.dream,GARDEN.dreamAwake);assert.ok(r.seeds.has('glass-seed'));assert.equal(r.snapshot().shortcuts,1);
  settle(r);assert.equal(r.y,0);assert.equal(r.x,49);
});

test('missing an orchard rooftop lands in a useful lower garden without lost discoveries',()=>{
  const r=new RibbonRules();walkPath(r,orchard);reach(r,-55,0,3);
  assert.ok(r.seeds.has('orchard-seed'));assert.equal(r.recoveries,0);
});

test('the low acorn lift carries a waiting explorer to tree-house height',()=>{
  const r=new RibbonRules(),lift=r.course.platforms.find(p=>p.id==='acorn-lift');
  r.x=lift.x;r.y=platformAt(lift,r.clock).y;r.support=lift.id;r.grounded=true;
  settle(r,4);assert.ok(r.y>7.9);assert.equal(r.support,lift.id);assert.equal(r.recoveries,0);
});

test('cellar curtain opens a two-way stump shortcut and doors resist immediate bounce-back',()=>{
  const r=new RibbonRules();reach(r,28,0);action(r);
  assert.equal(r.room().id,'cellar');assert.equal(action(r).some(e=>e.kind==='door'),false);
  settle(r);walkPath(r,[[137,1.7],[145,3.4],[153,5.1],[145,6.4]]);
  assert.ok(action(r).some(e=>e.kind==='door'));assert.equal(r.room().id,'orchard');
  assert.ok(r.opened.has('curtain'));assert.ok(r.opened.has('stump'));
  settle(r);action(r);assert.equal(r.room().id,'cellar');
});

test('one seed per region gates the finale; walking right, seek, and recovery cannot award victory',()=>{
  const r=new RibbonRules();r.x=GARDEN.finishX;r.y=GARDEN.finishY;r.step(DT);
  assert.equal(r.status,'playing');assert.equal(r.platformActive(r.course.platforms.find(p=>p.gate)),false);
  r.seek(1);r.rescue();assert.equal(r.seeds.size,0);assert.equal(r.status,'playing');assert.equal(r.snapshot().progress,0);
});

test('upper routes activate their room checkpoint while passing above its flag',()=>{
  const r=new RibbonRules();r.x=-24;r.y=3;r.grounded=false;r.coyote=0;
  assert.ok(r.step(DT).some(event=>event.type==='checkpoint'));
  assert.equal(r.checkpoint,1);r.rescue();assert.equal(r.x,-24);assert.equal(r.y,.025);
});

test('the roof window can be traversed in reverse to reach the orchard seed',()=>{
  const r=new RibbonRules();reach(r,49,0);action(r);
  walkPath(r,[[57,1.7],[65,3.4],[73,5.1],[81,6.8],[89,8.4],[94,8.4],[102,8.4]]);
  action(r);settle(r);reach(r,-64,8.4);assert.ok(r.seeds.has('orchard-seed'));assert.equal(r.recoveries,0);
});

test('the secret upper window drops onto the broad cellar seed pod',()=>{
  const r=new RibbonRules();r.x=-87;action(r);settle(r);
  reach(r,164,3.4);assert.ok(r.seeds.has('cellar-seed'));assert.equal(r.recoveries,0);
});

test('stuck hints point toward missing seeds instead of always sending explorers right',()=>{
  const r=new RibbonRules();r.clock=GARDEN.hintDelay+1;r.x=34;
  assert.match(r.snapshot().hint,/←/,'the orchard seed is left of the courtyard');
  r.seeds.add('orchard-seed');r.x=5;
  assert.match(r.snapshot().hint,/→/,'the glass seed is right of the courtyard');
  r.x=94;r.y=0;
  assert.match(r.snapshot().hint,/↑/,'the glass seed is above its lower path');
});

test('roof guidance uses nearby windows instead of sending explorers off the roof',()=>{
  const r=new RibbonRules();r.x=94;r.y=8.4;r.seeds.add('glass-seed');
  assert.equal(r.guidance().id,'glass-window');assert.equal(r.guidance().direction,'→');
  r.x=-64;r.seeds.clear();r.seeds.add('orchard-seed');
  assert.equal(r.guidance().id,'orchard-window');assert.equal(r.guidance().direction,'←');
});

test('guidance develops the current region before routing to another missing seed',()=>{
  const r=new RibbonRules();r.x=125;
  assert.equal(r.guidance().id,'cellar-seed');
  r.seeds.add('cellar-seed');
  assert.equal(r.guidance().id,'cellar-home');
  r.seeds.add('orchard-seed');
  assert.equal(r.guidance().id,'cellar-glass');
});

test('three seeds immediately guide the return shortcut and rescue keeps that destination',()=>{
  const r=new RibbonRules();r.x=164;r.y=3.4;r.checkpoint=3;
  for(const seed of r.course.seeds)r.seeds.add(seed.id);
  assert.equal(r.guidance().id,'cellar-home');
  assert.ok(r.snapshot().hint,'the final return should not wait for the stuck timer');
  r.rescue();settle(r);assert.equal(r.guidance().id,'cellar-home');assert.equal(r.guidance().direction,'↻');
  action(r);settle(r);assert.equal(r.guidance().kind,'finish');
});

test('courtyard guidance follows the reachable petal ascent rather than the final height',()=>{
  const r=new RibbonRules();r.x=28;
  for(const seed of r.course.seeds)r.seeds.add(seed.id);
  for(let i=0;i<6;i++){
    const guide=r.guidance();assert.equal(guide.id,`finale-${i}`);
    reach(r,guide.x,r.course.platforms.find(p=>p.id===guide.id).y);
  }
  assert.equal(r.status,'finished');assert.equal(r.recoveries,0);
});
