import test from 'node:test';
import assert from 'node:assert/strict';
import { RibbonRules } from '../js/ribbon-rules.js';

const DT=1/120;
/** Ground under x at Mirio's height, so the pilot jumps a creek instead of walking into it. */
function supported(r,x){return r.course.platforms.some(p=>!p.move&&Math.abs(p.y-r.y)<.05&&Math.abs(x-p.x)<=p.w/2);}
/** Plays like a child would: run at the target, jump up to it, jump every creek. */
function reach(r,x,y,limit=25){
  for(let t=0;t<limit;t+=DT){
    if(r.status==='finished')return;
    const dx=x-r.x;
    if(Math.abs(dx)<.28&&r.grounded&&Math.abs(r.y-y)<.4){r.step(.1);return;}
    const climb=r.y<y-.3&&Math.abs(dx)<7.1,creek=r.y<.05&&!supported(r,r.x+Math.sign(dx));
    r.step(DT,{x:Math.max(-1,Math.min(1,(dx-r.vx*.12)*2)),jump:r.grounded&&(climb||creek),jumpHeld:true});
  }
  assert.fail(`Unreachable ${x},${y}: ${JSON.stringify(r.snapshot())}`);
}
const ROUTE=[
  [16,1.8],[24,3.4],[44,4.6],                                // Blütenhof: petals, then the spring flower
  [82,1.8],[89,3.5],[96,5.2],[103,6.9],[109,8.4],[115,8.4],[122,5.4],  // Baumhaus: up to the balcony and its seed
  [168,1.7],[175,3.4],[182,5.1],[189,6.8],[195,8.4],[203,8.4],      // Glashaus: vine stairs to the roof seed
  [224,0],[264,4.4],                                         // Kellergarten: the spring flower to the pod
  [306,2],[315,4],[306,6],[315,8],[306,10],[315,12],         // the tower to the Blütentor
];

test('the garden is one run: every creek is jumpable, every seed on the way, the Blütentor at the top',()=>{
  const r=new RibbonRules();
  for(const [x,y] of ROUTE)reach(r,x,y);
  assert.equal(r.status,'finished');assert.equal(r.seeds.size,3);assert.equal(r.recoveries,0);
  assert.equal(r.snapshot().progress,1);assert.equal(r.checkpoint,4);
  assert.ok(r.time>35&&r.time<60,`a clean run takes ${r.time.toFixed(1)} s`);
  const time=r.time;r.step(1,{x:1,jump:true});assert.equal(r.time,time);
});

test('the seeds are a bonus: running along the ground to the tower still finishes',()=>{
  const r=new RibbonRules();
  for(const [x,y] of [[300,0],[306,2],[315,4],[306,6],[315,8],[306,10],[315,12]])reach(r,x,y,60);
  assert.equal(r.status,'finished');assert.ok(r.seeds.size<3);
});

test('walking into a creek costs two seconds and returns Mirio to the last flag',()=>{
  const r=new RibbonRules();
  for(let t=0;t<14&&r.recoveries===0;t+=DT)r.step(DT,{x:1});
  assert.equal(r.recoveries,1);assert.equal(r.penalties,2);assert.equal(r.x,r.course.checkpoints[0].x);
});

test('under the tower is not the finish, and progress follows the furthest point reached',()=>{
  const r=new RibbonRules();r.seek(1);
  for(let t=0;t<3;t+=DT)r.step(DT,{x:1});
  assert.equal(r.status,'playing');assert.ok(r.snapshot().progress>.9&&r.snapshot().progress<1);
  const back=r.snapshot().progress;for(let t=0;t<2;t+=DT)r.step(DT,{x:-1});
  assert.equal(r.snapshot().progress,back);
});
