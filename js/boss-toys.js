// The arena turns a shockwave into a spring toy, with no extra controls.
import * as THREE from 'three';
const TOYS=Object.freeze({padRadius:1.15,padHeight:.7,orbit:3.6,chargeTime:6,launchSpeed:11.5,gravity:.72,aimSpeed:3.8});

export class BossToys {
  #pads=[]; #launches=0; #warning; #arena; #flat;
  constructor(group,arena,flat,colliders){
    this.#arena=arena;this.#flat=flat;
    const material=new THREE.MeshPhongMaterial({color:0x88d8ca,emissive:0x8fdaba,emissiveIntensity:.1});
    for(let index=0;index<3;index++){
      const angle=index*Math.PI*2/3,x=Math.sin(angle)*TOYS.orbit,z=Math.cos(angle)*TOYS.orbit;
      const local=new THREE.Vector3(x,0,z).applyQuaternion(flat),pos=arena.center.clone().add(local);
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(TOYS.padRadius,TOYS.padRadius*.8,TOYS.padHeight,16),material.clone());
      mesh.position.copy(pos).addScaledVector(arena.up,TOYS.padHeight/2);mesh.quaternion.copy(flat);group.add(mesh);
      const arrow=new THREE.Mesh(new THREE.ConeGeometry(.2,.4,3),new THREE.MeshBasicMaterial({color:0xffe6a0}));
      arrow.position.copy(pos).addScaledVector(arena.up,TOYS.padHeight+.3);arrow.quaternion.copy(flat);group.add(arrow);
      if(colliders)colliders(arena.planet).push({kind:'cyl',base:pos,axis:arena.up.clone(),radius:TOYS.padRadius,height:TOYS.padHeight});
      this.#pads.push({x,z,pos,mesh,arrow,charge:0,cooldown:0,waveSeen:false});
    }
    this.#warning=new THREE.Mesh(new THREE.RingGeometry(1.8,2.15,40).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xffdf82,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));
    this.#warning.quaternion.copy(flat);group.add(this.#warning);this.reset();
  }
  reset(){this.#launches=0;for(const pad of this.#pads){pad.charge=0;pad.cooldown=0;pad.waveSeen=false;pad.mesh.material.emissiveIntensity=.1;}this.#warning.visible=false;}
  update(dt,boss,playerPosition,player,events){
    this.#warning.visible=boss.state==='crouch'||boss.state==='leap';
    if(this.#warning.visible){
      const target=boss.state==='leap'?{x:boss.leap.x1,z:boss.leap.z1}:boss.target;
      boss.toWorld(target.x,target.z,.04,this.#warning.position);
    }
    // A fast pound may already have landed during Player's physics step.
    const pounding=player?.pounding||player?.events?.some(event=>event.type==='pound');
    const active=['roar','chase','crouch','leap','slam','dizzy','hurt'].includes(boss.state);
    for(const pad of this.#pads){
      pad.cooldown=Math.max(0,pad.cooldown-dt);pad.charge=Math.max(0,pad.charge-dt);
      const wave=boss.wave;
      if(!wave.active)pad.waveSeen=false;
      if(wave.active&&!pad.waveSeen&&wave.radius>=Math.hypot(pad.x-wave.x,pad.z-wave.z)-TOYS.padRadius){pad.charge=TOYS.chargeTime;pad.waveSeen=true;}
      pad.mesh.material.emissiveIntensity=pad.charge>0?.85:.1;pad.arrow.visible=active&&pad.charge>0;
      if(!active||!playerPosition||pad.cooldown>0||(!pounding&&pad.charge<=0))continue;
      const p=playerPosition;
      if(Math.hypot(p.x-pad.x,p.z-pad.z)>TOYS.padRadius+.2||p.h<TOYS.padHeight-.15||p.h>TOYS.padHeight+.4||player.body.vel.dot(this.#arena.up)>1)continue;
      player.bounce({speed:TOYS.launchSpeed,gravityScale:TOYS.gravity});
      const toward=new THREE.Vector3(boss.x-pad.x,0,boss.z-pad.z);
      if(toward.lengthSq()>0){toward.normalize().applyQuaternion(this.#flat);player.body.vel.addScaledVector(toward,TOYS.aimSpeed);}
      pad.cooldown=1;pad.charge=0;this.#launches++;
      events.push({type:'spring',kind:'arenaPad',pos:pad.pos.clone(),color:0x88d8ca});
    }
  }
  snapshot(){return {launches:this.#launches,warning:this.#warning.visible,pads:this.#pads.map(pad=>({x:pad.x,z:pad.z,charged:pad.charge>0}))};}
  layout(){return this.#pads.map(pad=>({pos:pad.pos.clone().addScaledVector(this.#arena.up,TOYS.padHeight).toArray(),up:this.#arena.up.toArray(),radius:TOYS.padRadius}));}
}
