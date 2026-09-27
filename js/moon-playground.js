// Optional moon islands keep the drawing-based floor and its original route intact.
import * as THREE from 'three';
import { surfacePoint, tangentDir } from './world.js';

const MOON_TOYS = Object.freeze({radius:2.7, thickness:.5, drift:.65, period:6.5,
  guardianRadius:1.9, launchSpeed:20, launchGravity:.72, forwardSpeed:7, cooldown:1.4, viewDistance:48});
const UP=new THREE.Vector3(0,1,0);

export class MoonPlayground {
  #viewOrigin=new THREE.Vector3(); #sightLine=new THREE.Vector3(); #closest=new THREE.Vector3();
  #moon; #islands=[]; #guardian; #time=0; #cooldown=0; #visited=new Set(); #launches=0;
  constructor(scene,level,colliders){
    this.#moon=level.planets.find(planet=>planet.id==='mond');
    const landing=level.rocket.flight.landing,forward=level.arena.facing;
    const side=new THREE.Vector3().crossVectors(landing,forward).normalize();
    const route=(t,offset)=>landing.clone().multiplyScalar(Math.cos(Math.PI*t)).addScaledVector(forward,Math.sin(Math.PI*t)).addScaledVector(side,offset).normalize();
    const cream=new THREE.MeshPhongMaterial({color:0xfff1d4,shininess:30});
    const violet=new THREE.MeshPhongMaterial({color:0xb2a4e2,shininess:40});
    const gold=new THREE.MeshPhongMaterial({color:0xffdf88,emissive:0x725220,emissiveIntensity:.1});
    const dark=new THREE.MeshBasicMaterial({color:0x453859});
    const sphere=new THREE.SphereGeometry(1,12,8);
    const part=(group,geometry,material,pos,scale)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...pos);mesh.scale.set(...scale);group.add(mesh);return mesh;};
    const stops=[[.22,-.42,2],[.34,-.5,3],[.46,-.62,4.3],[.58,-.6,5.5],[.7,-.44,6.8],[.8,-.2,8.2]];
    for(const [index,[t,offset,height]]of stops.entries()){
      const up=route(t,offset),anchor=surfacePoint(this.#moon,up,height),group=new THREE.Group();
      group.quaternion.setFromUnitVectors(UP,up);scene.add(group);
      part(group,new THREE.CylinderGeometry(MOON_TOYS.radius,MOON_TOYS.radius*.8,MOON_TOYS.thickness,20),cream,[0,-MOON_TOYS.thickness/2,0],[1,1,1]);
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;part(group,sphere,violet,[Math.sin(a)*1.4,-.55,Math.cos(a)*1.4],[1.1,.62,1.1]);}
      const lantern=part(group,sphere,gold.clone(),[0,.55,-1.5],[.25,.45,.25]);
      part(group,new THREE.TorusGeometry(.52,.035,5,20),gold,[0,.6,-1.5],[1,1,1]);
      const collider={kind:'cyl',base:anchor.clone().addScaledVector(up,-MOON_TOYS.thickness),axis:up,radius:MOON_TOYS.radius,height:MOON_TOYS.thickness};
      colliders(this.#moon).push(collider);
      const drift=tangentDir(side,up);
      this.#islands.push({id:`moon-cloud-${index}`,anchor,up,group,lantern,collider,drift,offset:0,phase:index*.8});
    }
    const up=route(.78,.45),pos=surfacePoint(this.#moon,up,5.6),group=new THREE.Group();
    group.position.copy(pos);group.quaternion.setFromUnitVectors(UP,up);scene.add(group);
    // A broad perch starts the toss outside the arena overhang.
    part(group,new THREE.CylinderGeometry(2.8,2.5,.5,20),cream,[0,-.25,0],[1,1,1]);
    colliders(this.#moon).push({kind:'cyl',base:pos.clone().addScaledVector(up,-.5),axis:up.clone(),radius:2.8,height:.5});
    part(group,sphere,violet,[0,.3,0],[1.9,.4,1.7]);
    part(group,sphere,cream,[0,.47,0],[1.55,.35,1.35]);
    for(const sign of [-1,1])part(group,new THREE.BoxGeometry(.4,.06,.06),dark,[sign*.43,.58,1.19],[1,1,1]);
    part(group,sphere,gold,[0,.39,1.36],[.12,.06,.05]);
    part(group,new THREE.ConeGeometry(.3,.6,3),gold,[0,1.4,0],[1,1,1]);
    this.#guardian={pos,up,group,launchUp:level.arena.dir.clone(),target:surfacePoint(this.#moon,level.arena.dir,level.arena.top)};
    this.reset();
  }
  reset(){
    this.#time=0;this.#cooldown=0;this.#visited.clear();this.#launches=0;
    for(const island of this.#islands){island.offset=0;island.group.position.copy(island.anchor);island.collider.base.copy(island.anchor).addScaledVector(island.up,-MOON_TOYS.thickness);island.lantern.material.emissiveIntensity=.1;}
    this.#guardian.group.scale.set(1,1,1);
  }
  step(dt,player,{active=true}={}){
    const events=[];
    if(!active||!Number.isFinite(dt)||dt<=0)return events;
    dt=Math.min(dt,.1);this.#time+=dt;this.#cooldown=Math.max(0,this.#cooldown-dt);
    const body=player?.state==='play'&&player.body.planet===this.#moon?player.body:null;
    for(const island of this.#islands){
      const previous=island.group.position,relative=body?.pos.clone().sub(previous);
      const height=relative?.dot(island.up);
      const aboard=body?.onGround&&Math.abs(height)<.22&&relative.addScaledVector(island.up,-height).length()<MOON_TOYS.radius+.2;
      const offset=Math.sin(this.#time*Math.PI*2/MOON_TOYS.period+island.phase)*MOON_TOYS.drift;
      // Carry grounded riders with their island before the next physics step.
      if(aboard)body.pos.addScaledVector(island.drift,offset-island.offset);
      island.offset=offset;island.group.position.copy(island.anchor).addScaledVector(island.drift,offset);
      island.collider.base.copy(island.group.position).addScaledVector(island.up,-MOON_TOYS.thickness);
      if(aboard&&!this.#visited.has(island.id)){
        this.#visited.add(island.id);island.lantern.material.emissiveIntensity=.9;
        events.push({type:'ring',kind:'moonCloud',pos:island.group.position.clone(),color:0xffdf88});
      }
    }
    const guardian=this.#guardian;
    if(!body||!body.onGround||this.#cooldown>0)return events;
    const rel=body.pos.clone().sub(guardian.pos),height=rel.dot(guardian.up);
    if(Math.abs(height)>.6||rel.addScaledVector(guardian.up,-height).length()>MOON_TOYS.guardianRadius)return events;
    player.bounce({speed:MOON_TOYS.launchSpeed,gravityScale:MOON_TOYS.launchGravity});
    const toward=tangentDir(guardian.target.clone().sub(body.pos),guardian.launchUp);
    body.vel.copy(guardian.launchUp).multiplyScalar(MOON_TOYS.launchSpeed).addScaledVector(toward,MOON_TOYS.forwardSpeed);
    this.#cooldown=MOON_TOYS.cooldown;this.#launches++;
    events.push({type:'spring',kind:'moonGuardian',strong:true,pos:guardian.pos.clone(),color:0xb2a4e2});
    return events;
  }
  update(time,camera,{reducedMotion=false}={}){
    // Hide distant toys and toys wholly behind the moon, keeping collisions alive.
    this.#viewOrigin.copy(camera.position).sub(this.#moon.center);
    const visible=group=>{
      if(camera.position.distanceToSquared(group.position)>MOON_TOYS.viewDistance**2)return false;
      this.#sightLine.copy(group.position).sub(camera.position);
      const fraction=THREE.MathUtils.clamp(-this.#viewOrigin.dot(this.#sightLine)/Math.max(.001,this.#sightLine.lengthSq()),0,1);
      this.#closest.copy(this.#viewOrigin).addScaledVector(this.#sightLine,fraction);
      return this.#closest.length()>this.#moon.radius-MOON_TOYS.radius;
    };
    for(const island of this.#islands)island.group.visible=visible(island.group);
    this.#guardian.group.visible=visible(this.#guardian.group);
    this.#guardian.group.scale.y=reducedMotion?1:1+Math.sin(time*1.6)*.055;
  }
  snapshot(){return {visited:[...this.#visited],total:this.#islands.length,launches:this.#launches};}
  layout(){return {platforms:this.#islands.map(island=>({id:island.id,pos:island.group.position.toArray(),up:island.up.toArray(),radius:MOON_TOYS.radius})),guardian:{pos:this.#guardian.pos.toArray(),up:this.#guardian.up.toArray(),target:this.#guardian.target.toArray()}};}
}
