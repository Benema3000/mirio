import {TILT_START,TILT_FINISH,TILT_CHECKPOINTS,TILT_BASIN,TILT_PATHS,tiltFloor,tiltCourse} from './tilt-course.js';

export const TILT=Object.freeze({radius:.78,gravity:24,maxAngle:.22,angleResponse:4.6,levelResponse:13,
  drag:.28,brakeDrag:9,topSpeed:6.1,step:1/120,checkpointReach:3.3,
  gutterGrace:.42,recoveryTime:.65,recoveryPenalty:2,finishReach:3.8,finishSpeed:2,finishHold:.35});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=n=>Number.isFinite(n)?n:0;
const ZONES=Object.freeze(['Waschbrettwiese','Regenbogensteg','Schaumlagune','Handtuchhimmel']);

export class TiltRules {
  #state={}; #shortcuts=new Set(); #pendingShortcut=null;

  constructor(){this.reset();}

  reset(){
    Object.assign(this.#state,{status:'playing',x:TILT_START.x,y:TILT_START.y,vx:0,vy:0,tiltX:0,tiltY:0,
      time:0,penalty:0,checkpoint:0,bridgeOpen:false,bridgeCharge:0,braking:false,gutter:0,
      recovering:0,recoveries:0,finishCharge:0,progress:0,branch:'wash'});
    this.#shortcuts.clear();this.#pendingShortcut=null;return this.snapshot();
  }

  #catch(){
    const r=this.#state,home=r.checkpoint?TILT_CHECKPOINTS[r.checkpoint-1]:TILT_START;
    r.x=home.x;r.y=home.y;r.vx=r.vy=r.tiltX=r.tiltY=0;r.gutter=0;
    r.recovering=TILT.recoveryTime;r.recoveries++;r.penalty+=TILT.recoveryPenalty;r.time+=TILT.recoveryPenalty;
    r.progress=(home.y-TILT_START.y)/(TILT_FINISH.y-TILT_START.y);this.#pendingShortcut=null;
    return {type:'rescue',penalty:TILT.recoveryPenalty};
  }

  rescue(){return this.#state.status==='playing'?[this.#catch()]:[];}

  step(dt,input={}){
    const r=this.#state;
    if(r.status!=='playing'||!Number.isFinite(dt)||dt<=0)return [];
    dt=Math.min(dt,.1);r.braking=Boolean(input.jumpHeld);const events=[],steps=Math.ceil(dt/TILT.step);
    const length=Math.max(1,Math.hypot(finite(input.x),finite(input.y)));
    const tilt={x:r.braking?0:finite(input.x)/length*TILT.maxAngle,y:r.braking?0:finite(input.y)/length*TILT.maxAngle};
    for(let i=0;i<steps&&r.status==='playing';i++)this.#tick(dt/steps,tilt,events);
    return events;
  }

  #tick(dt,tilt,events){
    const r=this.#state;r.time+=dt;
    if(r.recovering>0){r.recovering=Math.max(0,r.recovering-dt);return;}
    const response=1-Math.exp(-dt*(r.braking?TILT.levelResponse:TILT.angleResponse));
    r.tiltX+=(tilt.x-r.tiltX)*response;r.tiltY+=(tilt.y-r.tiltY)*response;
    const floor=tiltFloor(r.x,r.y,r),onBoard=floor.distance<=0;
    if(onBoard){
      // The stick sets a board angle. Gravity, including the shaped road's slope, moves the bubble.
      r.vx+=TILT.gravity*(Math.sin(r.tiltX)-floor.slopeX)*dt;
      r.vy+=TILT.gravity*(Math.sin(r.tiltY)-floor.slopeY)*dt;
    }
    const drag=Math.exp(-(r.braking?TILT.brakeDrag:TILT.drag)*dt);r.vx*=drag;r.vy*=drag;
    const speed=Math.hypot(r.vx,r.vy);
    if(speed>TILT.topSpeed){r.vx*=TILT.topSpeed/speed;r.vy*=TILT.topSpeed/speed;}
    r.x+=r.vx*dt;r.y+=r.vy*dt;
    const landed=tiltFloor(r.x,r.y,r);r.gutter=landed.distance>0?r.gutter+dt:0;
    if(r.gutter>TILT.gutterGrace){events.push(this.#catch());return;}
    if(landed.distance>0)return;
    r.branch=landed.route;
    const next=TILT_CHECKPOINTS[r.checkpoint],from=r.checkpoint?TILT_CHECKPOINTS[r.checkpoint-1].y:TILT_START.y;
    const to=next?.y??TILT_FINISH.y;
    r.progress=(clamp(landed.progress,from,to)-TILT_START.y)/(TILT_FINISH.y-TILT_START.y);
    if(landed.shortcut&&landed.stage===r.checkpoint&&landed.progress>from+(to-from)*.25)this.#pendingShortcut=landed.route;
    if(next&&distance(r,next)<TILT.checkpointReach){
      if(this.#pendingShortcut)this.#shortcuts.add(this.#pendingShortcut);
      this.#pendingShortcut=null;r.checkpoint++;events.push({type:'checkpoint',index:r.checkpoint});
    }
    const basinNear=distance(r,TILT_BASIN)<TILT_BASIN.radius;
    if(!r.bridgeOpen){
      const charging=basinNear&&r.checkpoint>=2&&r.braking&&Math.hypot(r.vx,r.vy)<1;
      r.bridgeCharge=clamp(r.bridgeCharge+dt*(charging?1/TILT_BASIN.chargeTime:-.5),0,1);
      if(r.bridgeCharge===1){r.bridgeOpen=true;events.push({type:'foam'});}
    }
    const finish=r.checkpoint===TILT_CHECKPOINTS.length&&distance(r,TILT_FINISH)<TILT.finishReach&&Math.hypot(r.vx,r.vy)<TILT.finishSpeed;
    r.finishCharge=finish?r.finishCharge+dt:0;
    if(r.finishCharge<TILT.finishHold)return;
    if(this.#pendingShortcut)this.#shortcuts.add(this.#pendingShortcut);
    r.status='finished';r.progress=1;r.vx=r.vy=0;events.push({type:'finish'});
  }

  snapshot(){
    const r=this.#state,floor=tiltFloor(r.x,r.y,r),basinNear=distance(r,TILT_BASIN)<TILT_BASIN.radius;
    const zoneName=ZONES[Math.min(r.checkpoint,ZONES.length-1)];
    return {...r,speed:Math.hypot(r.vx,r.vy),height:floor.height,totalCheckpoints:TILT_CHECKPOINTS.length,
      zoneName,roomName:zoneName,basinNear,shortcuts:this.#shortcuts.size,shortcutIds:[...this.#shortcuts],
      collectibles:r.checkpoint,actionHint:basinNear&&!r.bridgeOpen?'◎ Halten → Schaumbrücke':'◎ Brett beruhigen',
      surfaceSlope:{x:floor.slopeX,y:floor.slopeY},finishReady:r.checkpoint===TILT_CHECKPOINTS.length};
  }

  layout(){return tiltCourse();}

  /** Named locations are controlled fixtures; only numeric finish previews grant checkpoints. */
  seek(target){
    const r=this.#state;let place;
    if(typeof target==='string'){
      place=[{id:'start',...TILT_START},{id:'finish',...TILT_FINISH},...TILT_CHECKPOINTS].find(p=>p.id===target);
      if(!place){const path=TILT_PATHS.find(p=>p.id===target),point=path?.points[1];if(point)place={x:point[0],y:point[1]};}
    }else if(Number.isFinite(target)){
      const index=clamp(Math.floor(target*4),0,3);r.checkpoint=index;
      place=target>=.95?TILT_FINISH:index?TILT_CHECKPOINTS[index-1]:TILT_START;
    }
    if(!place)return this.snapshot();
    r.x=place.x;r.y=place.y;r.vx=r.vy=r.tiltX=r.tiltY=0;r.gutter=r.recovering=r.finishCharge=0;
    return this.snapshot();
  }
}
