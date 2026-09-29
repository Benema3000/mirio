// Fixed pools give every pinball contact a local response without per-hit meshes.
import * as THREE from 'three';
import {PINBALL_PALETTES} from './pinball-art.js';

const SPARKS=72,RIPPLES=10,TRAIL=18,SPARK_LIFE=.65,RIPPLE_LIFE=.42;
const hidden=new THREE.Matrix4().makeScale(0,0,0);
export class PinballEffects {
  #sparks; #rings; #trail; #particles=[]; #ripples=[]; #history=[];
  #sparkCursor=0; #ringCursor=0; #dummy=new THREE.Object3D(); #color=new THREE.Color(); #lastTable=-1;

  constructor(scene){
    this.#sparks=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.14),new THREE.MeshBasicMaterial({color:0xffffff}),SPARKS);
    this.#rings=new THREE.InstancedMesh(new THREE.RingGeometry(.88,1,24),new THREE.MeshBasicMaterial({color:0xffe6a9,transparent:true,opacity:.62,side:THREE.DoubleSide,depthWrite:false}),RIPPLES);
    this.#trail=new THREE.InstancedMesh(new THREE.SphereGeometry(.24,6,4),new THREE.MeshBasicMaterial({color:0xfff4bf,transparent:true,opacity:.45,depthWrite:false}),TRAIL);
    for(const mesh of [this.#sparks,this.#rings,this.#trail]){mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}
    this.reset();
  }

  reset(){
    this.#particles=[];this.#ripples=[];this.#history=[];
    for(const [mesh,count]of [[this.#sparks,SPARKS],[this.#rings,RIPPLES],[this.#trail,TRAIL]]){
      for(let i=0;i<count;i++)mesh.setMatrixAt(i,hidden);mesh.instanceMatrix.needsUpdate=true;
    }
  }

  hit(event){
    if(!Number.isFinite(event.x)||!Number.isFinite(event.y))return;
    const celebration=event.type==='note'||event.type==='pinball-toy',count=celebration?14:5;
    const color=PINBALL_PALETTES[event.table??0].accent;
    for(let i=0;i<count;i++){
      const index=this.#sparkCursor++%SPARKS,angle=i*Math.PI*2/count+(event.x*.31),speed=celebration?4.5:2.5;
      this.#particles[index]={x:event.x,y:(event.height??0)+.65,z:-event.y,vx:Math.cos(angle)*speed,vy:2+(i%3),vz:Math.sin(angle)*speed,life:SPARK_LIFE};
      this.#sparks.setColorAt(index,this.#color.setHex(i%2?color:0xfff2cd));
    }
    this.#sparks.instanceColor.needsUpdate=true;
    this.#ripples[this.#ringCursor++%RIPPLES]={x:event.x,y:(event.height??0)+.23,z:-event.y,life:RIPPLE_LIFE};
  }

  render(dt,state,{reducedMotion=false}={}){
    if(state.table!==this.#lastTable){this.reset();this.#lastTable=state.table;}
    const dummy=this.#dummy;
    for(let i=0;i<SPARKS;i++){
      const p=this.#particles[i];
      if(p)p.life-=dt;
      if(!p||p.life<=0||reducedMotion){this.#sparks.setMatrixAt(i,hidden);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=7*dt;
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.life*5,p.life*7,0);dummy.scale.setScalar(Math.max(0,p.life/SPARK_LIFE));dummy.updateMatrix();this.#sparks.setMatrixAt(i,dummy.matrix);
    }
    for(let i=0;i<RIPPLES;i++){
      const p=this.#ripples[i];
      if(!p||p.life<=0){this.#rings.setMatrixAt(i,hidden);continue;}
      p.life-=dt;const size=reducedMotion?1.6:1+(1-p.life/RIPPLE_LIFE)*2;
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(size,size,Math.max(0,p.life/RIPPLE_LIFE));dummy.updateMatrix();this.#rings.setMatrixAt(i,dummy.matrix);
    }
    if(dt>0){
      if(!state.served&&(state.speed>8||state.toy?.active)&&!reducedMotion)this.#history.unshift({x:state.x,y:state.height+.7,z:-state.y});
      else this.#history.pop();
    }
    this.#history.length=Math.min(this.#history.length,TRAIL);
    for(let i=0;i<TRAIL;i++){
      const p=this.#history[i];
      if(!p||reducedMotion){this.#trail.setMatrixAt(i,hidden);continue;}
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar((1-i/TRAIL)*.85);dummy.updateMatrix();this.#trail.setMatrixAt(i,dummy.matrix);
    }
    for(const mesh of [this.#sparks,this.#rings,this.#trail])mesh.instanceMatrix.needsUpdate=true;
  }
}
