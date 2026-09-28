// One physics map drives the pinball tables, their toys and the renderer.
export const MARBLE = Object.freeze({radius:.72,gravity:9.8,drag:.055,topSpeed:39,
  physicsStep:1/180,recoveryTime:.7,recoveryPenalty:2,pulseCooldown:3,pulseTime:.45,
  launchChargeTime:.85,launchMin:27,launchMax:35,flipperLength:5.7,flipperRadius:.48,
  flipperRest:-.53,flipperRaised:.27,flipperSpeed:15,flipperShot:30,flipperHoldShot:24,
  targetRadius:1.35,targetReach:2.3,gateY:40,gateReach:2.8,transitionTime:1.2});
export const PINBALL_TABLE = Object.freeze({GARDEN:0,CLOCK:1,MOON:2});
export const PINBALL_PHASE = Object.freeze({SERVE:'serve',BALL:'ball',LIFT:'lift',FINISHED:'finished'});
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
  #state={}; #notes=new Set(); #cooldowns=new Map(); #flip={}; #jumpWasHeld=false;

  constructor(){this.reset();}

  reset(){
    Object.assign(this.#state,{status:'playing',phase:PINBALL_PHASE.SERVE,table:0,x:START.x,y:START.y,
      vx:0,vy:0,time:0,penalty:0,cooldown:0,pulse:0,recovering:0,recoveries:0,bumps:0,
      launches:0,flips:0,charge:0,transition:0,launchLane:true,saveTime:0});
    this.#notes.clear();this.#cooldowns.clear();this.#jumpWasHeld=false;
    this.#flip={left:{angle:MARBLE.flipperRest,held:false,window:0,cooldown:0},
      right:{angle:MARBLE.flipperRest,held:false,window:0,cooldown:0}};
    return this.snapshot();
  }

  #serve(){
    const r=this.#state;r.phase=PINBALL_PHASE.SERVE;r.x=START.x;r.y=START.y;
    r.vx=r.vy=r.charge=0;r.launchLane=true;this.#jumpWasHeld=false;
  }

  #recover(){
    const r=this.#state;this.#serve();r.recovering=MARBLE.recoveryTime;r.recoveries++;
    r.penalty+=MARBLE.recoveryPenalty;r.time+=MARBLE.recoveryPenalty;
    return {type:'rescue',penalty:MARBLE.recoveryPenalty};
  }

  rescue(){return this.#state.status==='playing'?[this.#recover()]:[];}

  #launch(events){
    const r=this.#state;r.phase=PINBALL_PHASE.BALL;r.vy=MARBLE.launchMin+(MARBLE.launchMax-MARBLE.launchMin)*r.charge;
    r.charge=0;r.launches++;r.saveTime=5;events.push({type:'spring'});
  }

  step(dt,input={}){
    const r=this.#state;
    if(r.status!=='playing'||!Number.isFinite(dt)||dt<=0)return [];
    dt=Math.min(dt,.1);const events=[],held=Boolean(input.jumpHeld);
    const flippers={left:Boolean(input.flipperLeft??(input.x<-.25)),right:Boolean(input.flipperRight??(input.x>.25))};
    for(const id of ['left','right']){
      const f=this.#flip[id],active=flippers[id]||(held&&r.phase===PINBALL_PHASE.BALL);
      if(active&&!f.held){f.window=FLIP_WINDOW;r.flips++;events.push({type:'flipper',side:id});}
      f.held=active;
    }
    if(input.action&&r.phase===PINBALL_PHASE.BALL&&r.cooldown===0){
      r.vx+=(flippers.left===flippers.right?0:flippers.left?-1:1)*NUDGE_SIDE;r.vy+=NUDGE_UP;
      r.cooldown=MARBLE.pulseCooldown;r.pulse=MARBLE.pulseTime;events.push({type:'ring'});
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
    r.bumps++;events.push({type:'marble-bumper',id:spec.id});return true;
  }

  #flippers(dt,events){
    const r=this.#state;
    for(const spec of MARBLE_FLIPPERS){
      const f=this.#flip[spec.id],target=f.held?MARBLE.flipperRaised:MARBLE.flipperRest;
      f.angle+=clamp(target-f.angle,-MARBLE.flipperSpeed*dt,MARBLE.flipperSpeed*dt);
      f.window=Math.max(0,f.window-dt);f.cooldown=Math.max(0,f.cooldown-dt);
      if(r.phase!==PINBALL_PHASE.BALL||r.launchLane)continue;
      const s=flipperSegment(spec,f.angle),incoming=r.vy;
      const contact=this.#hitSegment(s.ax,s.ay,s.bx,s.by,MARBLE.flipperRadius);
      if(!contact||contact.ny<-.2||!f.held||f.cooldown>0)continue;
      if(incoming>2&&f.window===0)continue;
      // Carry incoming momentum through each stroke to avoid repeating bounce loops.
      const power=f.window>0?MARBLE.flipperShot:MARBLE.flipperHoldShot;
      r.vy=power+Math.min(4,Math.abs(incoming)*.14);r.vx=spec.side*(1.5+(1-contact.t)*8)+r.vx*.28;
      f.cooldown=FLIP_COOLDOWN;events.push({type:'flipper-hit',side:spec.id,strong:f.window>0});
    }
  }

  #targets(events){
    const r=this.#state;
    for(const bell of MARBLE_BELLS){
      if(bell.table!==r.table)continue;
      const span=Math.hypot(r.x-bell.x,r.y-bell.y);
      if(span<MARBLE.targetReach&&!this.#notes.has(bell.id)){
        this.#notes.add(bell.id);events.push({type:'note',id:bell.id,notes:this.#notes.size});
      }
      if(span<MARBLE.radius+bell.radius)this.#circle(bell,1.5,events);
    }
  }

  #tick(dt,held,events){
    const r=this.#state;r.time+=dt;r.cooldown=Math.max(0,r.cooldown-dt);r.pulse=Math.max(0,r.pulse-dt);
    for(const [id,time]of this.#cooldowns)this.#cooldowns.set(id,Math.max(0,time-dt));
    this.#flippers(dt,events);
    if(r.recovering>0){r.recovering=Math.max(0,r.recovering-dt);return;}
    if(r.phase===PINBALL_PHASE.SERVE){if(held)r.charge=Math.min(1,r.charge+dt/MARBLE.launchChargeTime);return;}
    if(r.phase===PINBALL_PHASE.LIFT){
      r.transition-=dt;
      if(r.transition>0)return;
      r.table++;this.#serve();events.push({type:'checkpoint',table:r.table});return;
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
    for(const [a,b]of MARBLE_WALLS)this.#hitSegment(...a,...b,.16);
    for(const sling of MARBLE_SLINGS){
      const c=this.#hitSegment(...sling.a,...sling.b,.3);
      if(!c||(this.#cooldowns.get(sling.id)||0)>0)continue;
      r.vx+=c.nx*SLING_FORCE;r.vy+=Math.max(3,c.ny*SLING_FORCE);
      this.#cooldowns.set(sling.id,TARGET_COOLDOWN);events.push({type:'marble-bumper',id:sling.id});
    }
    if(r.table===PINBALL_TABLE.CLOCK){
      const angle=clockAngle(r.time),dx=Math.cos(angle)*MARBLE_CLOCK.length/2,dy=Math.sin(angle)*MARBLE_CLOCK.length/2;
      const c=this.#hitSegment(-dx,MARBLE_CLOCK.y-dy,dx,MARBLE_CLOCK.y+dy,MARBLE_CLOCK.radius);
      if(c&&(this.#cooldowns.get('clock')||0)===0){
        r.vy=Math.max(9,r.vy+6);r.vx+=Math.cos(r.time*MARBLE_CLOCK.speed)*3;
        this.#cooldowns.set('clock',TARGET_COOLDOWN);events.push({type:'marble-bumper',id:'clock'});
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
      r.vx=r.vy=0;r.x=0;r.y=MARBLE.gateY;
      if(r.table===MARBLE_ROOMS.length-1){r.status='finished';r.phase=PINBALL_PHASE.FINISHED;events.push({type:'finish'});return;}
      r.phase=PINBALL_PHASE.LIFT;r.transition=MARBLE.transitionTime;events.push({type:'chime'});return;
    }
    if(r.y>42.5){r.y=42.5;r.vy=-Math.abs(r.vy)*RESTITUTION;}
    if(r.y<DRAIN_Y){
      // A five-second ball saver teaches the plunger without charging for an early miss.
      if(r.saveTime>0){this.#serve();r.recovering=MARBLE.recoveryTime;events.push({type:'ball-save'});return;}
      events.push(this.#recover());
    }
  }

  snapshot(){
    const r=this.#state,notes=this.#notes.size,ready=notes>=(r.table+1)*TARGETS_PER_TABLE,served=r.phase===PINBALL_PHASE.SERVE;
    return {status:r.status,phase:r.phase,time:r.time,penalty:r.penalty,progress:r.status==='finished'?1:notes/(TOTAL_TARGETS+1),
      table:r.table,tableNumber:r.table+1,totalTables:MARBLE_ROOMS.length,roomName:MARBLE_ROOMS[r.table].name,
      x:r.x,y:r.y,vx:r.vx,vy:r.vy,speed:Math.hypot(r.vx,r.vy),height:0,served,plungerCharge:r.charge,
      flipperLeft:this.#flip.left.held,flipperRight:this.#flip.right.held,
      flipperAngles:{left:this.#flip.left.angle,right:this.#flip.right.angle},
      notes,totalNotes:TOTAL_TARGETS,noteIds:[...this.#notes],tableNotes:notes-r.table*TARGETS_PER_TABLE,
      notesNear:null,noteReady:false,braking:false,collectibles:notes,finishReady:ready,finishCharge:0,
      actionHint:served?'↓ halten · loslassen':ready?'↑ Zur Glocke':'← → Flipper · ♪ 3 Ziele',
      cooldown:r.cooldown,pulse:r.pulse,recoveries:r.recoveries,recovering:r.recovering,gutter:0,
      bumps:r.bumps,flips:r.flips,launches:r.launches,transition:r.transition,saveTime:r.saveTime,
      floor:'table',returnTarget:null};
  }

  layout(){return {rooms:MARBLE_ROOMS,bells:MARBLE_BELLS,bumpers:MARBLE_BUMPERS,walls:MARBLE_WALLS,
    flippers:MARBLE_FLIPPERS,slings:MARBLE_SLINGS,start:START,finish:{x:0,y:MARBLE.gateY}};}

  seek(progress){
    const r=this.#state;
    if(Number.isFinite(progress)){
      const count=progress>=.95?TOTAL_TARGETS:clamp(Math.floor(progress*TOTAL_TARGETS),0,TOTAL_TARGETS);
      this.#notes=new Set(MARBLE_BELLS.slice(0,count).map(b=>b.id));r.table=Math.min(MARBLE_ROOMS.length-1,Math.floor(count/TARGETS_PER_TABLE));
      this.#serve();
      if(count===TOTAL_TARGETS){r.phase=PINBALL_PHASE.BALL;r.launchLane=false;r.x=0;r.y=39;r.vy=12;}
      return this.snapshot();
    }
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
