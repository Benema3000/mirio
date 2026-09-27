// Rolling, braking and ringing share one board map with the renderer.
export const MARBLE = Object.freeze({radius: .82, acceleration: 7.2, drag: .68, topSpeed: 5.2,
  brakeDrag: 8.5, brakeControl: .3, bellReach: 3.3, bellSpeed: 2.2, pulseCooldown: 1.2,
  pulseReach: 4.6, pulseTime: .5, gutterTime: .55, recoveryTime: .65, recoveryPenalty: 2,
  finishReach: 4.1, finishHold: .5, physicsStep: 1 / 120});
export const MARBLE_ROOMS = Object.freeze([
  {id:'drum',name:'Trommelhof',x:0,y:4,radius:7,color:0xf3d081},
  {id:'crossing',name:'Klangkreuzung',x:0,y:18,radius:6.5,color:0xb3d6bb},
  {id:'rose',name:'Puddingpavillon',x:-18,y:29,radius:7.5,color:0xedb0c5},
  {id:'blue',name:'Kugelkarussell',x:18,y:29,radius:7.5,color:0x9fcfdf},
  {id:'gold',name:'Sternenglocke',x:0,y:54,radius:8,color:0xf1d381},
]);
export const MARBLE_PATHS = Object.freeze([
  {id:'opening',width:7,points:[[0,4],[0,18]]},
  {id:'rose-low',width:6,points:[[0,18],[-10,18],[-18,29]]},
  {id:'blue-low',width:6,points:[[0,18],[10,18],[18,29]]},
  {id:'rose-high',width:6,points:[[-18,29],[-18,43],[0,54]]},
  {id:'blue-high',width:6,points:[[18,29],[18,43],[0,54]]},
  {id:'bank',width:3.8,points:[[0,18],[-2,30],[2,42],[0,54]],bank:true},
]);
export const MARBLE_BELLS = Object.freeze([
  {id:'rose',x:-20,y:30,color:0xe78ba9,note:'♪'},
  {id:'blue',x:20,y:30,color:0x73b9d7,note:'♫'},
  {id:'gold',x:0,y:57,color:0xeabb55,note:'♬'},
]);
export const MARBLE_BUMPERS = Object.freeze([
  {id:'lesson',x:3.1,y:10,radius:1.05,phase:0,color:0xeac77d},
  {id:'pudding-a',x:-14,y:31,radius:1.2,phase:.7,color:0xeaa5bd},
  {id:'pudding-b',x:-21,y:25,radius:1.1,phase:2.2,color:0xeaa5bd},
  {id:'carousel-a',x:14,y:32,radius:1.25,phase:1.3,color:0x83c3dc},
  {id:'carousel-b',x:21,y:26,radius:1.1,phase:2.8,color:0x83c3dc},
  {id:'star-a',x:-4,y:54,radius:1.2,phase:.2,color:0xebca73},
  {id:'star-b',x:4,y:54,radius:1.2,phase:1.9,color:0xebca73},
]);
const START = Object.freeze({x:0,y:4});
const SURFACE_DRAG = Object.freeze({rose:1.08,blue:.4});
const FLOOR_KIND = Object.freeze({ROOM:'room',ROAD:'road',BANK:'bank'});
const BANK = Object.freeze({rise:1.35,rim:.16,guide:1.5,downhill:.55,momentum:.16,minSpeed:3,topFactor:1.18});
const BEAT = Object.freeze({period:3.6,active:.45,warning:.85});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function bumperBeat(time,bumper) {
  const phase=(time+bumper.phase)%BEAT.period,start=BEAT.period-BEAT.warning;
  return {active:phase<BEAT.active,anticipation:phase>start? (phase-start)/BEAT.warning : 0};
}

/** Signed distance to the union of rooms and roads; negative means safe floor. */
export function marbleFloor(x,y) {
  let best={distance:Infinity,x,y,id:'gutter',bank:false};
  const consider=(cx,cy,radius,id,kind=FLOOR_KIND.ROOM)=>{
    const dx=x-cx,dy=y-cy,span=Math.hypot(dx,dy),edge=span-radius;
    if(edge>=best.distance)return;
    best={distance:edge,x:cx+dx/Math.max(span,.001)*radius,y:cy+dy/Math.max(span,.001)*radius,centerX:cx,centerY:cy,id,bank:kind===FLOOR_KIND.BANK};
  };
  for(const room of MARBLE_ROOMS)consider(room.x,room.y,room.radius,room.id);
  for(const road of MARBLE_PATHS)for(let i=1;i<road.points.length;i++){
    const [ax,ay]=road.points[i-1],[bx,by]=road.points[i],dx=bx-ax,dy=by-ay;
    const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);
    consider(ax+dx*t,ay+dy*t,road.width/2,road.id,road.bank?FLOOR_KIND.BANK:FLOOR_KIND.ROAD);
  }
  return best;
}

export function marbleHeight(x,y) {
  const floor=marbleFloor(x,y);
  if(!floor.bank)return 0;
  return Math.sin(clamp((y-18)/36,0,1)*Math.PI)*BANK.rise+Math.hypot(x-floor.centerX,y-floor.centerY)**2*BANK.rim;
}

function homeTarget(x,y){
  if(Math.abs(x)<5&&y>21)return y>43?{x:2,y:42}:y>31?{x:-2,y:30}:{x:0,y:18};
  if(Math.abs(x)>6)return y>44?{x:Math.sign(x)*18,y:43}:y>31?{x:Math.sign(x)*18,y:29}
    :y>21?{x:Math.sign(x)*10,y:18}:{x:0,y:18};
  return {...START};
}

export class MarbleRules {
  #state={}; #notes=new Set(); #checkpoint={...START}; #bumpCooldown=new Map(); #bankVisits=new Set();

  constructor(){this.reset();}

  reset(){
    const r=this.#state;
    Object.assign(r,{status:'playing',x:START.x,y:START.y,vx:0,vy:0,time:0,penalty:0,
      cooldown:0,pulse:0,recovering:0,gutter:0,recoveries:0,bumps:0,braking:false,finishCharge:0});
    this.#notes.clear();this.#bankVisits.clear();this.#bumpCooldown.clear();this.#checkpoint={...START};
    return this.snapshot();
  }

  #recover(){
    const r=this.#state;
    r.x=this.#checkpoint.x;r.y=this.#checkpoint.y;r.vx=r.vy=0;
    r.gutter=0;r.recovering=MARBLE.recoveryTime;r.recoveries++;
    r.penalty+=MARBLE.recoveryPenalty;r.time+=MARBLE.recoveryPenalty;
    return {type:'rescue',penalty:MARBLE.recoveryPenalty};
  }

  rescue(){return this.#state.status==='playing'?[this.#recover()]:[];}

  #ring(events){
    const r=this.#state;
    if(r.cooldown>0||r.recovering>0)return;
    r.cooldown=MARBLE.pulseCooldown;r.pulse=MARBLE.pulseTime;events.push({type:'ring'});
    const speed=Math.hypot(r.vx,r.vy);
    for(const bell of MARBLE_BELLS){
      if(this.#notes.has(bell.id)||distance(r,bell)>MARBLE.bellReach||speed>MARBLE.bellSpeed)continue;
      this.#notes.add(bell.id);this.#checkpoint={x:bell.x,y:bell.y};
      events.push({type:'note',id:bell.id,notes:this.#notes.size});
    }
    // A pulse nudges the bubble away from nearby cushions, making them useful toys.
    for(const bumper of MARBLE_BUMPERS){
      const span=distance(r,bumper);
      if(span>MARBLE.pulseReach)continue;
      const push=2.8*(1-span/MARBLE.pulseReach);
      r.vx+=(r.x-bumper.x)/Math.max(.1,span)*push;
      r.vy+=(r.y-bumper.y)/Math.max(.1,span)*push;
      events.push({type:'marble-bumper',id:bumper.id});
    }
  }

  step(dt,input={}){
    const r=this.#state;
    if(r.status!=='playing'||!Number.isFinite(dt)||dt<=0)return [];
    dt=Math.min(dt,.1);const events=[];
    if(input.action)this.#ring(events);
    r.braking=Boolean(input.jumpHeld);
    const steps=Math.ceil(dt/MARBLE.physicsStep),h=dt/steps;
    for(let i=0;i<steps&&r.status==='playing';i++)this.#tick(h,input,events);
    return events;
  }

  #tick(dt,input,events){
    const r=this.#state;
    r.time+=dt;r.cooldown=Math.max(0,r.cooldown-dt);r.pulse=Math.max(0,r.pulse-dt);
    for(const [id,time]of this.#bumpCooldown)this.#bumpCooldown.set(id,Math.max(0,time-dt));
    if(r.recovering>0){r.recovering=Math.max(0,r.recovering-dt);return;}
    const floor=marbleFloor(r.x,r.y),length=Math.max(1,Math.hypot(input.x||0,input.y||0));
    const control=MARBLE.acceleration*(r.braking?MARBLE.brakeControl:1);
    r.vx+=(input.x||0)/length*control*dt;r.vy+=(input.y||0)/length*control*dt;
    const resistance=r.braking?MARBLE.brakeDrag:SURFACE_DRAG[floor.id]??MARBLE.drag;
    r.vx*=Math.exp(-resistance*dt);r.vy*=Math.exp(-resistance*dt);
    if(floor.bank){
      const speed=Math.hypot(r.vx,r.vy);
      // Carry momentum across the raised centre, with a gentle downhill pull.
      r.vx+=(floor.centerX-r.x)*BANK.guide*dt;r.vy+=(floor.centerY-r.y)*BANK.guide*dt;
      r.vy-=Math.cos(clamp((r.y-18)/36,0,1)*Math.PI)*BANK.downhill*dt;
      if(speed>BANK.minSpeed&&!r.braking){r.vx*=1+dt*BANK.momentum;r.vy*=1+dt*BANK.momentum;this.#bankVisits.add(Math.sign(r.vy));}
    }
    const speed=Math.hypot(r.vx,r.vy),limit=MARBLE.topSpeed*(floor.bank?BANK.topFactor:1);
    if(speed>limit){r.vx*=limit/speed;r.vy*=limit/speed;}
    r.x+=r.vx*dt;r.y+=r.vy*dt;
    for(const bumper of MARBLE_BUMPERS){
      const dx=r.x-bumper.x,dy=r.y-bumper.y,span=Math.hypot(dx,dy),reach=bumper.radius+MARBLE.radius;
      if(span>=reach)continue;
      const nx=span>.01?dx/span:1,ny=span>.01?dy/span:0;
      r.x=bumper.x+nx*reach;r.y=bumper.y+ny*reach;
      const inward=r.vx*nx+r.vy*ny;
      if(inward<0){r.vx-=inward*1.35*nx;r.vy-=inward*1.35*ny;}
      if((this.#bumpCooldown.get(bumper.id)||0)>0)continue;
      const force=bumperBeat(r.time,bumper).active?3.7:1.8;
      r.vx+=nx*force;r.vy+=ny*force;this.#bumpCooldown.set(bumper.id,.65);r.bumps++;
      events.push({type:'marble-bumper',id:bumper.id});
    }
    const landed=marbleFloor(r.x,r.y);
    r.gutter=landed.distance>0?r.gutter+dt:0;
    if(r.gutter>MARBLE.gutterTime){events.push(this.#recover());return;}
    if(landed.distance>0){r.vx*=Math.exp(-2*dt);r.vy*=Math.exp(-2*dt);}
    for(const room of MARBLE_ROOMS)if(distance(r,room)<2.6)this.#checkpoint={x:room.x,y:room.y};
    const ready=this.#notes.size===MARBLE_BELLS.length&&distance(r,START)<MARBLE.finishReach&&Math.hypot(r.vx,r.vy)<MARBLE.bellSpeed;
    r.finishCharge=ready?r.finishCharge+dt:0;
    if(r.finishCharge<MARBLE.finishHold)return;
    r.status='finished';r.vx=r.vy=0;events.push({type:'finish'});
  }

  snapshot(){
    const r=this.#state;
    const nearest=[...MARBLE_ROOMS].sort((a,b)=>distance(r,a)-distance(r,b))[0];
    const bell=MARBLE_BELLS.find(b=>!this.#notes.has(b.id)&&distance(r,b)<MARBLE.bellReach);
    const speed=Math.hypot(r.vx,r.vy),notes=this.#notes.size;
    return {status:r.status,time:r.time,penalty:r.penalty,progress:r.status==='finished'?1:notes/4,
      x:r.x,y:r.y,vx:r.vx,vy:r.vy,speed,braking:r.braking,notes,totalNotes:MARBLE_BELLS.length,
      noteIds:[...this.#notes],notesNear:bell?.id??null,noteReady:Boolean(bell&&speed<=MARBLE.bellSpeed),roomName:nearest.name,
      actionHint:bell?(speed>MARBLE.bellSpeed?'Bremsen → ♪':'♪ Glocke wecken'):notes===MARBLE_BELLS.length?'🥁 Zur Trommel':'♪ Klangstoss',
      cooldown:r.cooldown,pulse:r.pulse,recoveries:r.recoveries,recovering:r.recovering,gutter:r.gutter,
      bumps:r.bumps,bankTrips:this.#bankVisits.size,finishReady:notes===MARBLE_BELLS.length,finishCharge:r.finishCharge,
      returnTarget:notes===MARBLE_BELLS.length?homeTarget(r.x,r.y):null,
      floor:marbleFloor(r.x,r.y).id,height:marbleHeight(r.x,r.y),collectibles:notes};
  }

  layout(){return {rooms:MARBLE_ROOMS,paths:MARBLE_PATHS,bells:MARBLE_BELLS,bumpers:MARBLE_BUMPERS,start:START,finish:START};}

  seek(progress){
    const r=this.#state;
    let target;
    if(typeof progress==='string')target=[...MARBLE_BELLS,...MARBLE_ROOMS,...MARBLE_BUMPERS].find(place=>place.id===progress);
    else if(Number.isFinite(progress)){
      const count=progress>=.95?3:clamp(Math.floor(progress*3),0,3);
      this.#notes=new Set(MARBLE_BELLS.slice(0,count).map(b=>b.id));
      target=count===3?START:MARBLE_BELLS[count];
    }
    if(!target)return this.snapshot();
    r.x=target.x;r.y=target.y;r.vx=r.vy=0;r.gutter=r.recovering=0;r.cooldown=0;
    this.#checkpoint={x:target.x,y:target.y};return this.snapshot();
  }
}
