// Blütenpfad: deterministic, rendering-independent rules for a gentle side-scroll.
// Coordinates are metres; player y is at the soles and all platforms are one-way.
export const RIBBON = Object.freeze({ speed: 7.2, acceleration: 40, braking: 54, airAcceleration: 29,
  jumpSpeed: 12.4, gravity: 27, releasedGravity: 43, coyote: .13, jumpBuffer: .15,
  halfWidth: .28, height: 1.95, finishX: 334, recoveryPenalty: 2, fallY: -8 });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, to, amount) => v < to ? Math.min(to, v + amount) : Math.max(to, v - amount);

export function makeRibbonCourse() {
  const ground = [
    [-8,34,0], [37,58,.4], [61,80,0], [83,106,.7], [109,132,.4], [135,157,1.1],
    [160,184,0], [187,207,.6], [210,232,0], [235,257,.5], [260,281,0], [284,304,.8], [307,344,0],
  ].map(([left,right,y], i) => ({id:`ground-${i}`,x:(left+right)/2,y,w:right-left,kind:'ground',zone:Math.min(4,Math.floor(i/3))}));
  const upper = [
    [21,2.1,5.2], [48,2.8,5], [92,3.7,6], [101,5.2,5], [118,4.1,6],
    [143,3.7,5], [151,5.2,5], [171,2.45,5], [197,3.2,6], [218,2.3,5],
    [243,3.5,6], [252,5.1,5], [271,3.2,6], [295,3.6,6], [315,2.5,5],
  ].map(([x,y,w],i)=>({id:`petal-${i}`,x,y,w,kind:'petal',zone:Math.min(4,Math.floor(x/70))}));
  const moving = [
    {x:72,y:2.6,w:4.6,move:{axis:'x',amplitude:1.4,period:4.8,phase:0}},
    {x:111,y:5.1,w:4.8,move:{axis:'y',amplitude:.8,period:4.6,phase:.5}},
    {x:179,y:4.2,w:4.8,move:{axis:'x',amplitude:1.5,period:5.2,phase:1}},
    {x:228,y:4.2,w:4.8,move:{axis:'y',amplitude:.8,period:5,phase:2}},
    {x:263,y:5.3,w:4.8,move:{axis:'x',amplitude:1.3,period:4.5,phase:2.5}},
  ].map((p,i)=>({...p,id:`cloud-${i}`,kind:'cloud'}));
  // A low spring cloud catches the longest early gaps, teaching recovery safely.
  const catches = [35.5,81.5,158.5,208.5,282.5].map((x,i)=>({id:`catch-${i}`,x,y:-2.5,w:5.4,kind:'catch'}));
  const platforms=[...ground,...upper,...moving,...catches];
  const springs = [
    [88,.7], [139,1.1], [239,.5], [291,.8],
  ].map(([x,y],i)=>({id:`flower-${i}`,x,y,boost:16.7}));
  catches.forEach((p,i)=>springs.push({id:`cloud-spring-${i}`,x:p.x,y:p.y,boost:16.7,cloud:true}));
  const checkpoints = [[5,0],[64,0],[112,.4],[164,0],[214,0],[264,0],[310,0]]
    .map(([x,y],i)=>({id:`flag-${i}`,x,y,index:i}));
  const gems=[];
  // The low ribbon is reachable without any hidden trick. Each gap has a clear arc.
  for(const p of ground){
    const left=p.x-p.w/2,right=p.x+p.w/2;
    for(let x=Math.max(10,left+4);x<Math.min(right-2,329);x+=6.2)
      gems.push({id:`gem-${gems.length}`,x,y:p.y+1.0,route:'ribbon'});
  }
  for(let i=0;i<ground.length-1;i++){
    const a=ground[i],b=ground[i+1],middle=(a.x+a.w/2+b.x-b.w/2)/2;
    gems.push({id:`gem-${gems.length}`,x:middle,y:Math.max(a.y,b.y)+2.15,route:'jump'});
  }
  for(const p of upper) for(let k=-1;k<=1;k++)
    gems.push({id:`gem-${gems.length}`,x:p.x+k*1.15,y:p.y+1.05,route:'blossom'});
  for(const p of moving) gems.push({id:`gem-${gems.length}`,x:p.x,y:p.y+1.1,route:'cloud',platform:p.id});
  const critters = [[52,.4],[127,.4],[175,0],[224,0],[275,0],[322,0]]
    .map(([x,y],i)=>({id:`puff-${i}`,x,y,range:1.7,phase:i*1.3,speed:.85+i*.05}));
  return {name:'Blütenpfad',start:{x:5,y:0},finishX:RIBBON.finishX,platforms,springs,checkpoints,gems,critters};
}

export function platformAt(p, time) {
  const phase=p.move ? Math.sin(time*Math.PI*2/p.move.period+p.move.phase)*p.move.amplitude : 0;
  return {x:p.x+(p.move?.axis==='x'?phase:0),y:p.y+(p.move?.axis==='y'?phase:0),w:p.w,id:p.id};
}
export function critterAt(c,time){return {x:c.x+Math.sin(time*c.speed+c.phase)*c.range,y:c.y};}

export class RibbonRules {
  constructor(course=makeRibbonCourse()){this.course=course;this.reset();}
  reset(){
    this.x=this.course.start.x;this.y=this.course.start.y;this.vx=0;this.vy=0;this.facing=1;
    this.clock=0;this.time=0;this.penalties=0;this.status='playing';this.grounded=true;this.support='ground-0';
    this.coyote=RIBBON.coyote;this.buffer=0;this.airSpin=true;this.spin=0;this.springCooldown=0;
    this.recovery=0;this.invulnerable=0;this.checkpoint=0;this.collected=new Set();this.bumped=new Set();
    this.recoveries=0;this.bestX=this.x;this.lastLanding=0;
    return this.snapshot();
  }
  step(dt,controls={}){
    if(this.status!=='playing'||!Number.isFinite(dt)||dt<=0)return [];
    // Substepping handles slow devices without tunnelling through a narrow ledge.
    dt=Math.min(dt,.25);
    const events=[];
    if(controls.jump)this.buffer=RIBBON.jumpBuffer;
    if(controls.action&&!this.grounded&&this.airSpin&&this.recovery<=0){
      this.airSpin=false;this.spin=.36;this.vy=Math.max(this.vy,4.4);
      this.vx=(Math.abs(controls.x||0)>.1?Math.sign(controls.x):this.facing)*10.2;
      events.push({type:'jump',kind:'spin',x:this.x,y:this.y});
    }
    const steps=Math.ceil(dt/(1/120)),h=dt/steps;
    for(let i=0;i<steps&&this.status==='playing';i++)this._tick(h,controls,events);
    return events;
  }
  _tick(dt,controls,events){
    const beforeClock=this.clock;
    this.clock+=dt;this.time+=dt;
    this.buffer=Math.max(0,this.buffer-dt);this.spin=Math.max(0,this.spin-dt);
    this.springCooldown=Math.max(0,this.springCooldown-dt);this.invulnerable=Math.max(0,this.invulnerable-dt);
    if(this.recovery>0){this.recovery=Math.max(0,this.recovery-dt);return;}
    const input=clamp(Number.isFinite(controls.x)?controls.x:0,-1,1);
    if(Math.abs(input)>.1)this.facing=Math.sign(input);
    if(this.grounded&&this.support){
      const support=this.course.platforms.find(p=>p.id===this.support);
      if(support?.move){const a=platformAt(support,beforeClock),b=platformAt(support,this.clock);this.x+=b.x-a.x;this.y+=b.y-a.y;}
    }
    const target=input*RIBBON.speed;
    const acceleration=this.grounded?(Math.abs(input)>.05?RIBBON.acceleration:RIBBON.braking):RIBBON.airAcceleration;
    if(this.spin<=.19)this.vx=approach(this.vx,target,acceleration*dt);
    if(this.grounded)this.coyote=RIBBON.coyote;else this.coyote=Math.max(0,this.coyote-dt);
    if(this.buffer>0&&this.coyote>0){
      this.vy=RIBBON.jumpSpeed;this.grounded=false;this.support=null;this.coyote=0;this.buffer=0;
      events.push({type:'jump',x:this.x,y:this.y});
    }
    const oldY=this.y,oldVy=this.vy;
    this.x=clamp(this.x+this.vx*dt,-5,this.course.finishX+5);
    this.vy-=((this.vy>0&&!controls.jumpHeld&&this.springCooldown<=0)?RIBBON.releasedGravity:RIBBON.gravity)*dt;
    this.vy=Math.max(this.vy,-22);this.y+=this.vy*dt;
    let landed=null,highest=-Infinity;
    if(this.vy<=0){
      for(const p of this.course.platforms){
        const a=platformAt(p,beforeClock),b=platformAt(p,this.clock);
        if(this.x+RIBBON.halfWidth>b.x-b.w/2&&this.x-RIBBON.halfWidth<b.x+b.w/2&&oldY>=a.y-.07&&this.y<=b.y+.005&&b.y>highest){landed=b;highest=b.y;}
      }
    }
    const wasGrounded=this.grounded;
    this.grounded=!!landed;this.support=landed?.id||null;
    if(landed){
      this.y=landed.y;this.vy=0;this.airSpin=true;
      if(!wasGrounded&&oldVy<-2){this.lastLanding=this.clock;events.push({type:'land',speed:-oldVy,x:this.x,y:this.y});}
      // Buffered input is consumed immediately at contact, even at a low frame rate.
      if(this.buffer>0){this.vy=RIBBON.jumpSpeed;this.grounded=false;this.support=null;this.coyote=0;this.buffer=0;events.push({type:'jump',buffered:true,x:this.x,y:this.y});}
    }
    if(this.springCooldown<=0&&this.vy<=.1){
      for(const flower of this.course.springs){
        if(Math.abs(this.x-flower.x)<.86&&this.y>=flower.y-.07&&this.y<flower.y+.3){
          this.y=flower.y+.12;this.vy=flower.boost;this.grounded=false;this.support=null;this.coyote=0;
          this.airSpin=true;this.springCooldown=.68;this.buffer=0;
          events.push({type:'spring',id:flower.id,x:this.x,y:this.y});break;
        }
      }
    }
    for(const c of this.course.critters){
      if(this.invulnerable>0)break;
      const p=critterAt(c,this.clock),dx=Math.abs(this.x-p.x);
      if(dx<.74&&this.y<p.y+1&&this.y+RIBBON.height>p.y+.15){
        this.vy=oldY>p.y+.75&&oldVy<0?10:7;this.vx=this.facing*3.2;
        this.grounded=false;this.support=null;this.coyote=0;this.invulnerable=1.25;this.airSpin=true;
        this.bumped.add(c.id);events.push({type:'bump',id:c.id,friendly:true,x:this.x,y:this.y});break;
      }
    }
    for(const gem of this.course.gems){
      if(this.collected.has(gem.id))continue;
      let gx=gem.x,gy=gem.y;
      if(gem.platform){const p=this.course.platforms.find(p=>p.id===gem.platform),a=platformAt(p,this.clock);gx+=a.x-p.x;gy+=a.y-p.y;}
      if(Math.hypot((this.x-gx)*.9,(this.y+.95-gy)*.85)<1.05){
        this.collected.add(gem.id);events.push({type:'bit',id:gem.id,x:gx,y:gy,collectibles:this.collected.size});
      }
    }
    for(const cp of this.course.checkpoints){
      // Upper blossom routes earn the same safe return points as the low path.
      if(cp.index>this.checkpoint&&Math.abs(this.x-cp.x)<1.15&&this.y>cp.y-.1){
        this.checkpoint=cp.index;events.push({type:'checkpoint',id:cp.id,index:cp.index,x:cp.x,y:cp.y});
      }
    }
    this.bestX=Math.max(this.bestX,this.x);
    if(this.y<RIBBON.fallY)this._recover(events);
    if(this.x>=this.course.finishX&&this.y>-.5&&this.y<5.5){
      this.status='finished';this.vx=0;this.vy=0;events.push({type:'finish',time:this.time,collectibles:this.collected.size});
    }
  }
  _recover(events){
    const cp=this.course.checkpoints[this.checkpoint];
    this.x=cp.x;this.y=cp.y+.025;this.vx=0;this.vy=0;this.grounded=true;
    this.support=this.course.platforms.find(p=>p.kind==='ground'&&this.x>=p.x-p.w/2&&this.x<=p.x+p.w/2)?.id||null;
    this.recovery=.62;this.invulnerable=1.5;this.coyote=RIBBON.coyote;this.buffer=0;this.airSpin=true;this.spin=0;
    this.springCooldown=0;this.penalties+=RIBBON.recoveryPenalty;this.time+=RIBBON.recoveryPenalty;this.recoveries++;
    events.push({type:'bump',kind:'recovery',friendly:true,penalty:RIBBON.recoveryPenalty,x:this.x,y:this.y});
  }
  rescue(){const events=[];if(this.status==='playing')this._recover(events);return events;}
  seek(progress){
    // Test staging always chooses authored ground; it never crosses the finish or awards anything.
    const target=5+clamp(Number.isFinite(progress)?progress:0,0,.995)*(this.course.finishX-5);
    let p=this.course.platforms.filter(p=>p.kind==='ground').reduce((best,p)=>Math.abs(p.x-target)<Math.abs(best.x-target)?p:best);
    this.x=clamp(target,p.x-p.w/2+1.2,p.x+p.w/2-1.2);this.y=p.y;
    this.vx=0;this.vy=0;this.grounded=true;this.support=p.id;this.coyote=RIBBON.coyote;
    this.buffer=0;this.recovery=0;this.invulnerable=1;this.airSpin=true;this.spin=0;this.springCooldown=0;
    return this.snapshot();
  }
  snapshot(){return {status:this.status,time:this.time,progress:clamp((this.x-5)/(this.course.finishX-5),0,1),
    collectibles:this.collected.size,totalCollectibles:this.course.gems.length,checkpoint:this.checkpoint,
    recoveries:this.recoveries,penalties:this.penalties,x:this.x,y:this.y,vx:this.vx,vy:this.vy,
    grounded:this.grounded,airSpin:this.airSpin,recovering:this.recovery>0};}
}
