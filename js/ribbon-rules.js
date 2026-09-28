// Blütenpfad: deterministic side-on movement through the garden (garden-course.js).
import { GARDEN, makeGardenCourse } from './garden-course.js';
// Coordinates are metres; player y is at the soles and all platforms are one-way.
export const RIBBON = Object.freeze({ speed: 7.2, acceleration: 40, braking: 54, airAcceleration: 29,
  jumpSpeed: 12.4, gravity: 27, releasedGravity: 43, coyote: .13, jumpBuffer: .15,
  halfWidth: .28, height: 1.95, finishX: GARDEN.finishX, recoveryPenalty: 2, fallY: -8 });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, to, amount) => v < to ? Math.min(to, v + amount) : Math.max(to, v - amount);

export const makeRibbonCourse = makeGardenCourse;

export function platformAt(p, time) {
  const phase=p.move ? Math.sin(time*Math.PI*2/p.move.period+p.move.phase)*p.move.amplitude : 0;
  return {x:p.x+(p.move?.axis==='x'?phase:0),y:p.y+(p.move?.axis==='y'?phase:0),w:p.w,id:p.id};
}
export function critterAt(c,time){return {x:c.x+Math.sin(time*c.speed+c.phase)*c.range,y:c.y};}

export class RibbonRules {
  constructor(course=makeRibbonCourse()){this.course=course;this.reset();}
  reset(){
    this.x=this.course.start.x;this.y=this.course.start.y;this.vx=0;this.vy=0;this.facing=1;
    this.clock=0;this.time=0;this.penalties=0;this.status='playing';this.grounded=true;
    this.support=this.course.platforms.find(p=>p.kind==='ground')?.id??null;
    this.coyote=RIBBON.coyote;this.buffer=0;this.airSpin=true;this.spin=0;this.springCooldown=0;
    this.recovery=0;this.invulnerable=0;this.checkpoint=0;this.collected=new Set();this.bumped=new Set();
    this.recoveries=0;this.bestX=this.x;this.lastLanding=0;this.seeds=new Set();
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
    this.x=clamp(this.x+this.vx*dt,GARDEN.minX+1,GARDEN.maxX-1);
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
      // Walking back through the garden moves recovery to the flag just passed.
      if(cp.index!==this.checkpoint&&Math.abs(this.x-cp.x)<1.15&&this.y>=cp.y-.1){
        this.checkpoint=cp.index;events.push({type:'checkpoint',id:cp.id,index:cp.index,x:cp.x,y:cp.y});
      }
    }
    for(const seed of this.course.seeds){
      if(this.seeds.has(seed.id)||Math.hypot(this.x-seed.x,this.y+.95-seed.y)>1.25)continue;
      this.seeds.add(seed.id);
      events.push({type:'bit',kind:'seed',id:seed.id,x:seed.x,y:seed.y,seeds:this.seeds.size});
    }
    this.bestX=Math.max(this.bestX,this.x);
    if(this.y<RIBBON.fallY)this._recover(events);
    if(Math.abs(this.x-this.course.finishX)<2.4&&this.y>=this.course.finishY-.1&&this.grounded){
      this.status='finished';this.vx=0;this.vy=0;events.push({type:'finish',time:this.time,collectibles:this.collected.size});
    }
  }
  room(){return this.course.rooms.find(room=>this.x>=room.min&&this.x<room.max)??this.course.rooms[0];}
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
    // Test staging: stands Mirio at a garden's flag without granting anything.
    const stops=this.course.checkpoints,cp=stops[Math.min(stops.length-1,Math.floor(clamp(progress,0,1)*stops.length))];
    const p=this.course.platforms.find(p=>p.kind==='ground'&&cp.x>=p.x-p.w/2&&cp.x<=p.x+p.w/2);
    this.x=cp.x;this.y=p.y;
    this.vx=0;this.vy=0;this.grounded=true;this.support=p.id;this.coyote=RIBBON.coyote;
    this.buffer=0;this.recovery=0;this.invulnerable=1;this.airSpin=true;this.spin=0;this.springCooldown=0;
    return this.snapshot();
  }
  snapshot(){
    const room=this.room(),start=this.course.start.x;
    const progress=this.status==='finished'?1:clamp((this.bestX-start)/(this.course.finishX-start),0,1)*.95;
    return {status:this.status,time:this.time,progress,
      collectibles:this.collected.size,totalCollectibles:this.course.gems.length,checkpoint:this.checkpoint,
      recoveries:this.recoveries,penalties:this.penalties,x:this.x,y:this.y,vx:this.vx,vy:this.vy,
      grounded:this.grounded,airSpin:this.airSpin,recovering:this.recovery>0,
      seeds:this.seeds.size,totalSeeds:this.course.seeds.length,seedIds:[...this.seeds],
      room:room.id,roomName:room.name,actionHint:''};
  }
}
