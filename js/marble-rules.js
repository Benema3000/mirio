// One physics map drives the pinball tables, their toys and the renderer.
export const MARBLE = Object.freeze({radius:.72,gravity:9.8,drag:.055,topSpeed:39,
  physicsStep:1/180,recoveryTime:.7,recoveryPenalty:2,pulseCooldown:3,pulseTime:.45,
  launchChargeTime:.85,launchMin:27,launchMax:35,flipperLength:5.7,flipperRadius:.48,
  flipperRest:-.53,flipperRaised:.27,flipperSpeed:15,flipperShot:30,flipperHoldShot:24,
  targetRadius:1.35,targetReach:2.3,gateY:40,gateReach:2.8,transitionTime:1.2});
export const PINBALL_TABLE = Object.freeze({GARDEN:0,CLOCK:1,MOON:2});
export const PINBALL_PHASE = Object.freeze({SERVE:'serve',BALL:'ball',TOY:'toy',LIFT:'lift',FINISHED:'finished'});
export const MARBLE_ROOMS = Object.freeze([
  {id:'rose',name:'Puddinggarten',color:0xe9afbc,ink:0x94506d,gravity:MARBLE.gravity,
    bumpers:[[-4,20],[4,20],[0,34]],targets:[[-8,31],[0,25],[8,31]]},
  {id:'blue',name:'Kuckuckswerk',color:0xa8cbd5,ink:0x497ca0,gravity:MARBLE.gravity,
    bumpers:[[-5,26],[5,26],[0,35]],targets:[[-8,34],[0,22],[8,34]]},
  {id:'gold',name:'Mondkonzert',color:0xeac982,ink:0xb78638,gravity:7.7,
    bumpers:[[-5,23],[5,23],[0,35]],targets:[[-8,32],[0,26],[8,32]]},
]);
export const MARBLE_BELLS = Object.freeze(MARBLE_ROOMS.flatMap((room,table)=>room.targets.map(([x,y],index)=>({
  id:`${room.id}-${index}`,table,x,y,radius:MARBLE.targetRadius,color:room.color,note:['♪','♫','♬'][index],
}))));
export const MARBLE_BUMPERS = Object.freeze(MARBLE_ROOMS.flatMap((room,table)=>room.bumpers.map(([x,y],index)=>({
  id:`${room.id}-bumper-${index}`,table,x,y,radius:1.35,phase:index*.7,color:room.color,
}))));
export const MARBLE_FLIPPERS = Object.freeze([{id:'left',x:-6.4,y:7,side:1},{id:'right',x:6.4,y:7,side:-1}]);
export const MARBLE_WALLS = Object.freeze([
  [[-11,9],[-11,36]],[[-11,36],[-6,41]],[[-6,41],[-3,42]],
  [[3,42],[6,41]],[[6,41],[11,36]],[[11,36],[11,9]],
  [[-11,9],[-6.4,6.4]],[[11,9],[6.4,6.4]],
]);
export const MARBLE_SLINGS = Object.freeze([{id:'sling-left',a:[-10,13],b:[-7.5,9.7]},
  {id:'sling-right',a:[10,13],b:[7.5,9.7]}]);
// Raised toy paths reward a deliberate up-table shot; their mouths stay visible before waking.
export const PINBALL_ROUTE=Object.freeze({RETURN:'return',FINISH:'finish'});
export const MARBLE_TOYS=Object.freeze([
  {id:'vine',table:PINBALL_TABLE.GARDEN,mouth:{x:-8,y:23,radius:2.1},duration:2.5,
    path:[{x:-8,y:23,height:0},{x:-8,y:29,height:2},{x:-5,y:35,height:4},
      {x:3,y:36,height:4},{x:8,y:31,height:2},{x:7,y:27,height:0}],
    finishPath:[{x:-8,y:23,height:0},{x:-8,y:29,height:2},{x:-5,y:35,height:4},
      {x:3,y:36,height:4},{x:2,y:39,height:3},{x:0,y:40,height:0}],exit:{vx:-5,vy:-9}},
  {id:'cuckoo',table:PINBALL_TABLE.CLOCK,mouth:{x:0,y:32,radius:2.2},duration:2.2,
    path:[{x:0,y:32,height:0},{x:0,y:36,height:2},{x:0,y:39,height:4},
      {x:5,y:38,height:4},{x:8,y:33,height:2},{x:7,y:28,height:0}],
    finishPath:[{x:0,y:32,height:0},{x:0,y:36,height:2},{x:0,y:39,height:4},
      {x:0,y:41,height:3},{x:0,y:40,height:0}],exit:{vx:-6,vy:-10}},
  {id:'orbit',table:PINBALL_TABLE.MOON,mouth:{x:6,y:28,radius:2.3},duration:3.2,
    path:[{x:6,y:28,height:0},{x:9,y:33,height:2},{x:5,y:39,height:3.8},
      {x:-4,y:39,height:4.5},{x:-9,y:34,height:3.8},{x:-6,y:29,height:3},
      {x:1,y:30,height:2.5},{x:6,y:34,height:1.6},{x:8,y:27,height:0}],
    finishPath:[{x:6,y:28,height:0},{x:9,y:33,height:2},{x:5,y:39,height:3.8},
      {x:-4,y:39,height:4.5},{x:-9,y:34,height:3.8},{x:-6,y:29,height:3},
      {x:1,y:30,height:2.5},{x:3,y:36,height:4},{x:0,y:40,height:0}],exit:{vx:-7,vy:-8}},
]);
export const MARBLE_GUIDES=Object.freeze([
  {id:'leaf-bank',table:PINBALL_TABLE.GARDEN,a:[-10.5,17],b:[-8.8,19.8],radius:.24},
  {id:'petal-bank',table:PINBALL_TABLE.GARDEN,a:[9.8,27],b:[9,24],radius:.24},
  {id:'gear-left',table:PINBALL_TABLE.CLOCK,a:[-10,17],b:[-7,18.8],radius:.28},
  {id:'gear-right',table:PINBALL_TABLE.CLOCK,a:[8.8,31],b:[10.5,27],radius:.28},
  {id:'moon-bank',table:PINBALL_TABLE.MOON,a:[-10.3,24],b:[-8.7,20],radius:.22},
  {id:'comet-bank',table:PINBALL_TABLE.MOON,a:[8.5,19],b:[10.3,21],radius:.22},
]);
export const MARBLE_CLOCK_GATE=Object.freeze({period:4.6,openTime:2.8,anticipation:.65,barRadius:.18});
const TOY_SAVE_TIME=10,TOY_REARM_TIME=2,TOY_MIN_SHOT_SPEED=2,COMBO_WINDOW=6,COMBO_SAVE_TIME=3;
const CRADLE_POSITION=.58,CRADLE_RELEASE_SPEED=4;
const TIMED_AIM_HEEL=20,TIMED_AIM_SPAN=28;
const WALL_COOLDOWN=.1,WALL_SOUND_SPEED=4;

// Renderer and physics sample the same curve, including its elevation.
export function sampleMarblePath(path,progress){
  const scaled=Math.max(0,Math.min(1,progress))*(path.length-1),index=Math.min(path.length-2,Math.floor(scaled)),t=scaled-index;
  const points=[path[Math.max(0,index-1)],path[index],path[index+1],path[Math.min(path.length-1,index+2)]];
  const result={};
  for(const key of ['x','y','height']){
    const [a,b,c,d]=points.map(point=>point[key]);
    result[key]=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  }
  result.height=Math.max(0,result.height);return result;
}

const START=Object.freeze({x:13,y:4}),TOTAL_TARGETS=MARBLE_BELLS.length,TARGETS_PER_TABLE=3;
export const MARBLE_CLOCK=Object.freeze({x:0,y:29,length:5,radius:.2,speed:1.2,swing:.7});
export const clockAngle=time=>Math.sin(time*MARBLE_CLOCK.speed)*MARBLE_CLOCK.swing;
const LAUNCH_EXIT=36,LAUNCH_WALL=11.8,DRAIN_Y=.5,RESTITUTION=.82,SLING_FORCE=10;
const TARGET_COOLDOWN=.32,BUMPER_COOLDOWN=.18,FLIP_COOLDOWN=.15;
const NUDGE_UP=5,NUDGE_SIDE=3.5,FLIP_WINDOW=.19,BEAT_PERIOD=3.8;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function bumperBeat(time,bumper){
  const phase=(time+bumper.phase)%BEAT_PERIOD;
  return {active:phase<.45,anticipation:phase>3?(phase-3)/.8:0};
}

export function flipperSegment(spec,angle){
  return {ax:spec.x,ay:spec.y,bx:spec.x+Math.cos(angle)*MARBLE.flipperLength*spec.side,
    by:spec.y+Math.sin(angle)*MARBLE.flipperLength};
}

export function marbleFloor(x,y){
  return {id:'table',distance:Math.max(Math.abs(x)-14,1-y,y-43),bank:false};
}
export function marbleHeight(){return 0;}

function segmentContact(x,y,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);
  const cx=ax+dx*t,cy=ay+dy*t,span=Math.hypot(x-cx,y-cy);
  return {x:cx,y:cy,t,span,nx:span>.001?(x-cx)/span:0,ny:span>.001?(y-cy)/span:1};
}

export class MarbleRules {
  #state={}; #notes=new Set(); #cooldowns=new Map(); #flip={}; #jumpWasHeld=false; #toyCompletions=[0,0,0];

  constructor(){this.reset();}

  reset(){
    Object.assign(this.#state,{status:'playing',phase:PINBALL_PHASE.SERVE,table:0,x:START.x,y:START.y,
      vx:0,vy:0,time:0,penalty:0,cooldown:0,pulse:0,recovering:0,recoveries:0,bumps:0,
      launches:0,flips:0,charge:0,transition:0,launchLane:true,saveTime:0,height:0,
      toyProgress:0,toyCooldown:0,toyRoute:PINBALL_ROUTE.RETURN,cradled:null,combo:0,comboTime:0,maxCombo:0});
    this.#notes.clear();this.#cooldowns.clear();this.#jumpWasHeld=false;this.#toyCompletions.fill(0);
    this.#flip={left:{angle:MARBLE.flipperRest,held:false,window:0,cooldown:0},
      right:{angle:MARBLE.flipperRest,held:false,window:0,cooldown:0}};
    return this.snapshot();
  }

  #serve(){
    const r=this.#state;r.phase=PINBALL_PHASE.SERVE;r.x=START.x;r.y=START.y;
    r.vx=r.vy=r.charge=r.height=r.toyProgress=0;r.launchLane=true;r.cradled=null;r.toyRoute=PINBALL_ROUTE.RETURN;this.#jumpWasHeld=false;
  }

  #recover(){
    const r=this.#state;this.#serve();r.recovering=MARBLE.recoveryTime;r.recoveries++;
    r.penalty+=MARBLE.recoveryPenalty;r.time+=MARBLE.recoveryPenalty;
    return this.#event('rescue',{penalty:MARBLE.recoveryPenalty});
  }

  rescue(){return this.#state.status==='playing'?[this.#recover()]:[];}

  #launch(events){
    const r=this.#state;r.phase=PINBALL_PHASE.BALL;r.vy=MARBLE.launchMin+(MARBLE.launchMax-MARBLE.launchMin)*r.charge;
    r.charge=0;r.launches++;r.saveTime=5;events.push(this.#event('spring'));
  }

  step(dt,input={}){
    const r=this.#state;
    if(r.status!=='playing'||!Number.isFinite(dt)||dt<=0)return [];
    dt=Math.min(dt,.1);const events=[],held=Boolean(input.jumpHeld);
    const flippers={left:Boolean(input.flipperLeft??(input.x<-.25)),right:Boolean(input.flipperRight??(input.x>.25))};
    for(const id of ['left','right']){
      const f=this.#flip[id],active=flippers[id]||(held&&r.phase===PINBALL_PHASE.BALL);
      if(active&&!f.held){f.window=FLIP_WINDOW;r.flips++;events.push(this.#event('flipper',{side:id}));}
      f.held=active;
    }
    if(input.action&&r.phase===PINBALL_PHASE.BALL&&!r.cradled&&r.cooldown===0){
      r.vx+=(flippers.left===flippers.right?0:flippers.left?-1:1)*NUDGE_SIDE;r.vy+=NUDGE_UP;
      r.cooldown=MARBLE.pulseCooldown;r.pulse=MARBLE.pulseTime;events.push(this.#event('ring'));
    }
    if(r.phase===PINBALL_PHASE.SERVE&&this.#jumpWasHeld&&!held&&r.recovering===0)this.#launch(events);
    this.#jumpWasHeld=held;
    const steps=Math.ceil(dt/MARBLE.physicsStep),h=dt/steps;
    for(let i=0;i<steps&&r.status==='playing';i++)this.#tick(h,held,events);
    return events;
  }

  #hitSegment(ax,ay,bx,by,radius=0){
    const r=this.#state,c=segmentContact(r.x,r.y,ax,ay,bx,by),reach=MARBLE.radius+radius;
    if(c.span>=reach)return null;
    r.x=c.x+c.nx*reach;r.y=c.y+c.ny*reach;
    const inward=r.vx*c.nx+r.vy*c.ny;
    if(inward<0){r.vx-=(1+RESTITUTION)*inward*c.nx;r.vy-=(1+RESTITUTION)*inward*c.ny;}
    return c;
  }

  #circle(spec,force,events){
    const r=this.#state,dx=r.x-spec.x,dy=r.y-spec.y,span=Math.hypot(dx,dy),reach=MARBLE.radius+spec.radius;
    if(span>=reach)return false;
    const nx=span>.001?dx/span:1,ny=span>.001?dy/span:0;
    r.x=spec.x+nx*reach;r.y=spec.y+ny*reach;
    const inward=r.vx*nx+r.vy*ny;
    if(inward<0){r.vx-=(1+RESTITUTION)*inward*nx;r.vy-=(1+RESTITUTION)*inward*ny;}
    if((this.#cooldowns.get(spec.id)||0)>0)return true;
    r.vx+=nx*force;r.vy+=ny*force;this.#cooldowns.set(spec.id,BUMPER_COOLDOWN);
    r.bumps++;events.push(this.#event('marble-bumper',{id:spec.id}));return true;
  }

  #flippers(dt,events){
    const r=this.#state;
    if(r.cradled){
      const spec=MARBLE_FLIPPERS.find(flipper=>flipper.id===r.cradled),f=this.#flip[spec.id];
      const other=this.#flip[spec.id==='left'?'right':'left'];
      if(!f.held||other.held){
        r.cradled=null;r.vx=spec.side*CRADLE_RELEASE_SPEED;r.vy=0;
        events.push(this.#event('pinball-cradle',{side:spec.id,stage:'release'}));
      }
    }
    for(const spec of MARBLE_FLIPPERS){
      const f=this.#flip[spec.id],target=f.held?MARBLE.flipperRaised:MARBLE.flipperRest;
      f.angle+=clamp(target-f.angle,-MARBLE.flipperSpeed*dt,MARBLE.flipperSpeed*dt);
      f.window=Math.max(0,f.window-dt);f.cooldown=Math.max(0,f.cooldown-dt);
      if(r.phase!==PINBALL_PHASE.BALL||r.launchLane||r.cradled===spec.id)continue;
      const s=flipperSegment(spec,f.angle),incoming=r.vy;
      const contact=this.#hitSegment(s.ax,s.ay,s.bx,s.by,MARBLE.flipperRadius);
      if(!contact||contact.ny<-.2||!f.held||f.cooldown>0)continue;
      if(incoming>2&&f.window===0)continue;
      const other=this.#flip[spec.id==='left'?'right':'left'];
      if(f.window===0&&!other.held){
        r.cradled=spec.id;r.vx=r.vy=0;
        r.x=spec.x+spec.side*Math.cos(f.angle)*MARBLE.flipperLength*CRADLE_POSITION;
        r.y=spec.y+Math.sin(f.angle)*MARBLE.flipperLength*CRADLE_POSITION+MARBLE.radius+MARBLE.flipperRadius;
        events.push(this.#event('pinball-cradle',{side:spec.id,stage:'catch'}));continue;
      }
      // Carry incoming momentum through each stroke to avoid repeating bounce loops.
      const power=f.window>0?MARBLE.flipperShot:MARBLE.flipperHoldShot;
      r.vy=power+Math.min(4,Math.abs(incoming)*.14);
      const aim=f.window>0?TIMED_AIM_HEEL-contact.t*TIMED_AIM_SPAN:1.5+(1-contact.t)*8;
      r.vx=spec.side*aim+r.vx*.28;
      f.cooldown=FLIP_COOLDOWN;events.push(this.#event('flipper-hit',{side:spec.id,strong:f.window>0}));
    }
  }

  #targets(events){
    const r=this.#state;
    for(const bell of MARBLE_BELLS){
      if(bell.table!==r.table)continue;
      const span=Math.hypot(r.x-bell.x,r.y-bell.y);
      if(span<MARBLE.targetReach&&!this.#notes.has(bell.id)){
        this.#light(bell,events);
      }
      // Clock targets sink flush once lit, opening a clear shot toward the cuckoo.
      if(r.table===PINBALL_TABLE.CLOCK&&this.#notes.has(bell.id))continue;
      if(span<MARBLE.radius+bell.radius)this.#circle(bell,1.5,events);
    }
  }

  #event(type,details={}){
    const {x,y,table,height}=this.#state;return {type,x,y,table,height,...details};
  }

  #light(bell,events){
    const r=this.#state;
    if(this.#notes.has(bell.id))return;
    this.#notes.add(bell.id);r.combo=r.comboTime>0?r.combo+1:1;r.comboTime=COMBO_WINDOW;
    r.maxCombo=Math.max(r.maxCombo,r.combo);
    events.push(this.#event('note',{id:bell.id,notes:this.#notes.size,x:bell.x,y:bell.y}));
    if(r.combo>1){
      r.saveTime=Math.max(r.saveTime,COMBO_SAVE_TIME*r.combo);
      events.push(this.#event('pinball-combo',{combo:r.combo}));
    }
    if(this.#tableNotes()===1)events.push(this.#event('pinball-ready',{id:MARBLE_TOYS[r.table].id}));
  }

  #tableNotes(){return MARBLE_BELLS.filter(bell=>bell.table===this.#state.table&&this.#notes.has(bell.id)).length;}

  #toyState(){
    const r=this.#state,toy=MARBLE_TOYS[r.table],ready=this.#tableNotes()>0;
    const clockPhase=r.time%MARBLE_CLOCK_GATE.period;
    const open=ready&&(r.table!==PINBALL_TABLE.CLOCK||this.#tableNotes()===TARGETS_PER_TABLE||clockPhase<MARBLE_CLOCK_GATE.openTime);
    return {id:toy.id,ready,open,active:r.phase===PINBALL_PHASE.TOY,progress:r.toyProgress,
      completions:this.#toyCompletions[r.table],route:r.toyRoute,anticipation:r.table===PINBALL_TABLE.CLOCK&&ready&&!open
        ?clamp((clockPhase-(MARBLE_CLOCK_GATE.period-MARBLE_CLOCK_GATE.anticipation))/MARBLE_CLOCK_GATE.anticipation,0,1):0};
  }

  #enterToy(events){
    const r=this.#state,toy=MARBLE_TOYS[r.table],state=this.#toyState();
    if(!state.open||r.toyCooldown>0||r.vy<TOY_MIN_SHOT_SPEED)return false;
    if(Math.hypot(r.x-toy.mouth.x,r.y-toy.mouth.y)>toy.mouth.radius)return false;
    r.phase=PINBALL_PHASE.TOY;r.toyProgress=0;r.vx=r.vy=0;
    r.toyRoute=this.#tableNotes()>=TARGETS_PER_TABLE-1?PINBALL_ROUTE.FINISH:PINBALL_ROUTE.RETURN;
    Object.assign(r,sampleMarblePath(toy.path,0));
    events.push(this.#event('pinball-toy',{id:toy.id,stage:'start'}));return true;
  }

  #rideToy(dt,events){
    const r=this.#state,toy=MARBLE_TOYS[r.table];
    r.toyProgress=Math.min(1,r.toyProgress+dt/toy.duration);
    Object.assign(r,sampleMarblePath(r.toyRoute===PINBALL_ROUTE.FINISH?toy.finishPath:toy.path,r.toyProgress));
    if(r.toyProgress<1)return;
    r.phase=PINBALL_PHASE.BALL;r.vx=toy.exit.vx;r.vy=toy.exit.vy;r.toyCooldown=TOY_REARM_TIME;
    r.saveTime=Math.max(r.saveTime,TOY_SAVE_TIME);this.#toyCompletions[r.table]++;
    const unlit=MARBLE_BELLS.find(bell=>bell.table===r.table&&!this.#notes.has(bell.id));
    if(unlit)this.#light(unlit,events);
    events.push(this.#event('pinball-toy',{id:toy.id,stage:'complete'}));
    if(r.toyRoute===PINBALL_ROUTE.FINISH)this.#lift(events);
  }

  #lift(events){
    const r=this.#state;r.vx=r.vy=r.height=0;r.x=0;r.y=MARBLE.gateY;
    if(r.table===MARBLE_ROOMS.length-1){
      r.status='finished';r.phase=PINBALL_PHASE.FINISHED;events.push(this.#event('finish'));return;
    }
    r.phase=PINBALL_PHASE.LIFT;r.transition=MARBLE.transitionTime;events.push(this.#event('chime'));
  }

  #wall(a,b,radius,id,events){
    const r=this.#state,speed=Math.hypot(r.vx,r.vy),contact=this.#hitSegment(...a,...b,radius);
    if(!contact||speed<WALL_SOUND_SPEED||(this.#cooldowns.get('wall')||0)>0)return;
    this.#cooldowns.set('wall',WALL_COOLDOWN);events.push(this.#event('pinball-wall',{id}));
  }

  #tick(dt,held,events){
    const r=this.#state;r.time+=dt;r.toyCooldown=Math.max(0,r.toyCooldown-dt);r.comboTime=Math.max(0,r.comboTime-dt);
    r.cooldown=Math.max(0,r.cooldown-dt);r.pulse=Math.max(0,r.pulse-dt);
    for(const [id,time]of this.#cooldowns)this.#cooldowns.set(id,Math.max(0,time-dt));
    this.#flippers(dt,events);
    if(r.cradled){r.saveTime=Math.max(0,r.saveTime-dt);return;}
    if(r.recovering>0){r.recovering=Math.max(0,r.recovering-dt);return;}
    if(r.phase===PINBALL_PHASE.SERVE){if(held)r.charge=Math.min(1,r.charge+dt/MARBLE.launchChargeTime);return;}
    if(r.phase===PINBALL_PHASE.TOY){this.#rideToy(dt,events);return;}
    if(r.phase===PINBALL_PHASE.LIFT){
      r.transition-=dt;
      if(r.transition>0)return;
      r.table++;this.#serve();events.push(this.#event('checkpoint')); return;
    }
    const room=MARBLE_ROOMS[r.table];r.saveTime=Math.max(0,r.saveTime-dt);
    r.vy-=room.gravity*dt;r.vx*=Math.exp(-MARBLE.drag*dt);r.vy*=Math.exp(-MARBLE.drag*dt);
    const speed=Math.hypot(r.vx,r.vy);
    if(speed>MARBLE.topSpeed){r.vx*=MARBLE.topSpeed/speed;r.vy*=MARBLE.topSpeed/speed;}
    r.x+=r.vx*dt;r.y+=r.vy*dt;
    if(r.launchLane){
      r.x=START.x;r.vx=0;
      if(r.y>=LAUNCH_EXIT){r.launchLane=false;r.x=10.4;r.vx=-13;r.vy=9;}
      if(r.y<DRAIN_Y)events.push(this.#recover());return;
    }
    // The opening bank feeds the table; it cannot swallow a returning ball.
    if(r.x>LAUNCH_WALL){r.x=LAUNCH_WALL;r.vx=-Math.abs(r.vx)*RESTITUTION;}
    for(const [index,[a,b]]of MARBLE_WALLS.entries())this.#wall(a,b,.16,`rail-${index}`,events);
    for(const guide of MARBLE_GUIDES){
      if(guide.table===r.table)this.#wall(guide.a,guide.b,guide.radius,guide.id,events);
    }
    if(this.#enterToy(events))return;
    if(r.table===PINBALL_TABLE.CLOCK&&!this.#toyState().open){
      const {x,y,radius}=MARBLE_TOYS[r.table].mouth;
      this.#wall([x-radius,y],[x+radius,y],MARBLE_CLOCK_GATE.barRadius,'cuckoo-door',events);
    }
    for(const sling of MARBLE_SLINGS){
      const c=this.#hitSegment(...sling.a,...sling.b,.3);
      if(!c||(this.#cooldowns.get(sling.id)||0)>0)continue;
      r.vx+=c.nx*SLING_FORCE;r.vy+=Math.max(3,c.ny*SLING_FORCE);
      this.#cooldowns.set(sling.id,TARGET_COOLDOWN);events.push(this.#event('marble-bumper',{id:sling.id}));
    }
    if(r.table===PINBALL_TABLE.CLOCK){
      const angle=clockAngle(r.time),dx=Math.cos(angle)*MARBLE_CLOCK.length/2,dy=Math.sin(angle)*MARBLE_CLOCK.length/2;
      const c=this.#hitSegment(-dx,MARBLE_CLOCK.y-dy,dx,MARBLE_CLOCK.y+dy,MARBLE_CLOCK.radius);
      if(c&&(this.#cooldowns.get('clock')||0)===0){
        r.vy=Math.max(9,r.vy+6);r.vx+=Math.cos(r.time*MARBLE_CLOCK.speed)*3;
        this.#cooldowns.set('clock',TARGET_COOLDOWN);events.push(this.#event('marble-bumper',{id:'clock'}));
      }
    }
    for(const bumper of MARBLE_BUMPERS){
      if(bumper.table!==r.table)continue;
      this.#circle(bumper,bumperBeat(r.time,bumper).active?10:7,events);
    }
    this.#targets(events);
    const ready=this.#notes.size>=(r.table+1)*TARGETS_PER_TABLE;
    // Lit bell chutes gather close shots into the lift, without moving the ball elsewhere.
    if(ready&&r.y>31){r.vx+=(0-r.x)*3*dt;r.vy+=14*dt;}
    if(r.y>MARBLE.gateY&&Math.abs(r.x)<MARBLE.gateReach){
      if(!ready){r.y=MARBLE.gateY;r.vy=-Math.abs(r.vy)*RESTITUTION;return;}
      this.#lift(events);return;
    }
    if(r.y>42.5){r.y=42.5;r.vy=-Math.abs(r.vy)*RESTITUTION;}
    if(r.y<DRAIN_Y){
      // A five-second ball saver teaches the plunger without charging for an early miss.
      if(r.saveTime>0){this.#serve();r.recovering=MARBLE.recoveryTime;events.push(this.#event('ball-save'));return;}
      events.push(this.#recover());
    }
  }

  snapshot(){
    const r=this.#state,notes=this.#notes.size,ready=notes>=(r.table+1)*TARGETS_PER_TABLE,served=r.phase===PINBALL_PHASE.SERVE;
    return {status:r.status,phase:r.phase,time:r.time,penalty:r.penalty,progress:r.status==='finished'?1:notes/(TOTAL_TARGETS+1),
      table:r.table,tableNumber:r.table+1,totalTables:MARBLE_ROOMS.length,roomName:MARBLE_ROOMS[r.table].name,
      x:r.x,y:r.y,vx:r.vx,vy:r.vy,speed:Math.hypot(r.vx,r.vy),height:r.height,toy:this.#toyState(),toyCompletions:[...this.#toyCompletions],
      toyShots:this.#toyCompletions.reduce((sum,count)=>sum+count,0),combo:r.comboTime>0?r.combo:0,maxCombo:r.maxCombo,served,plungerCharge:r.charge,cradled:r.cradled,
      flipperLeft:this.#flip.left.held,flipperRight:this.#flip.right.held,
      flipperAngles:{left:this.#flip.left.angle,right:this.#flip.right.angle},
      notes,totalNotes:TOTAL_TARGETS,noteIds:[...this.#notes],tableNotes:notes-r.table*TARGETS_PER_TABLE,
      notesNear:null,noteReady:false,braking:false,collectibles:notes,finishReady:ready,finishCharge:0,
      actionHint:r.cradled?'Loslassen · zielen · schnippen':served?'↓ halten · loslassen':ready?'↑ Zur Glocke':'← → Flipper · ♪ 3 Ziele',
      cooldown:r.cooldown,pulse:r.pulse,recoveries:r.recoveries,recovering:r.recovering,gutter:0,
      bumps:r.bumps,flips:r.flips,launches:r.launches,transition:r.transition,saveTime:r.saveTime,
      floor:'table',returnTarget:null};
  }

  layout(){return {rooms:MARBLE_ROOMS,bells:MARBLE_BELLS,bumpers:MARBLE_BUMPERS,walls:MARBLE_WALLS,
    flippers:MARBLE_FLIPPERS,slings:MARBLE_SLINGS,toys:MARBLE_TOYS,guides:MARBLE_GUIDES,start:START,finish:{x:0,y:MARBLE.gateY}};}

  seek(progress){
    const r=this.#state;
    if(Number.isFinite(progress)){
      const count=progress>=.95?TOTAL_TARGETS:clamp(Math.floor(progress*TOTAL_TARGETS),0,TOTAL_TARGETS);
      this.#notes=new Set(MARBLE_BELLS.slice(0,count).map(b=>b.id));r.table=Math.min(MARBLE_ROOMS.length-1,Math.floor(count/TARGETS_PER_TABLE));
      this.#serve();
      if(count===TOTAL_TARGETS){r.phase=PINBALL_PHASE.BALL;r.launchLane=false;r.x=0;r.y=39;r.vy=12;}
      return this.snapshot();
    }
    r.height=0;r.toyProgress=0;r.toyCooldown=0;r.cradled=null;
    const toy=MARBLE_TOYS.find(item=>item.id===progress);
    if(toy){r.table=toy.table;r.phase=PINBALL_PHASE.BALL;r.launchLane=false;r.x=toy.mouth.x;r.y=toy.mouth.y-.1;r.vx=0;r.vy=12;}
    const target=MARBLE_BELLS.find(b=>b.id===progress)||MARBLE_BUMPERS.find(b=>b.id===progress);
    if(target){r.table=target.table;r.phase=PINBALL_PHASE.BALL;r.launchLane=false;r.x=target.x;r.y=target.y+2;r.vx=0;r.vy=-3;}
    if(progress==='drain'){r.phase=PINBALL_PHASE.BALL;r.launchLane=false;r.saveTime=0;r.x=0;r.y=1;r.vx=0;r.vy=-5;}
    if(progress==='left'||progress==='right'){
      const spec=MARBLE_FLIPPERS.find(f=>f.id===progress);r.phase=PINBALL_PHASE.BALL;r.launchLane=false;
      r.x=spec.x+spec.side*3;r.y=9.5;r.vx=0;r.vy=-6;
    }
    r.recovering=0;return this.snapshot();
  }
}
