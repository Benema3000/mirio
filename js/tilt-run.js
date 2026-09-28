// A bath-time toy world: paths of soap float over the bath water, and a steady
// camera watches from low behind as the stick tilts the whole world. Gravity
// rules share its exact map.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildMirio} from './mirio-model.js';
import {TILT,TiltRules} from './tilt-rules.js';
import {TILT_PATHS,TILT_BASIN,TILT_CHECKPOINTS,TILT_FINISH,tiltCourse,tiltFloor} from './tilt-course.js';

const CREAM=0xfff0cf,INK=0x526177,GOLD=0xefc968;
const SIGN_TEXT_MARGIN=24;
const UP=new THREE.Vector3(0,1,0);
const paint=(geometry,color)=>{
  const value=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3)value.toArray(colors,i);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');return geometry;
};
const orb=(x,y,z,sx,sy,sz,color)=>paint(new THREE.SphereGeometry(1,12,8).scale(sx,sy,sz).translate(x,y,z),color);
const cylinder=(x,y,z,r,h,color)=>paint(new THREE.CylinderGeometry(r,r,h,28).translate(x,y,z),color);
function batch(parts,material){
  const flat=parts.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(flat);
  for(const g of new Set([...parts,...flat]))g.dispose();return new THREE.Mesh(geometry,material);
}
function sign(text,width=5){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff3d9';ctx.beginPath();ctx.roundRect(4,4,504,120,26);ctx.fill();
  ctx.fillStyle='#526177';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 54px sans-serif';ctx.fillText(text,256,66,canvas.width-SIGN_TEXT_MARGIN*2);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false}));sprite.scale.set(width,width/4,1);return sprite;
}
function surface(points,color,lift=0){
  const geometry=new THREE.BufferGeometry(),positions=[];
  for(const [x,y] of points)positions.push(x,tiltFloor(x,y,{bridgeOpen:true}).height+lift,-y);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return paint(geometry,color);
}
function road(path){
  const parts=[],half=path.width/2;
  for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const nx=-(b[1]-a[1])/length,ny=(b[0]-a[0])/length,steps=Math.ceil(length),points=[];
    for(let j=0;j<steps;j++)for(let lane=0;lane<4;lane++){
      const corners=[];
      for(const [advance,across] of [[j,lane],[j+1,lane],[j,lane+1],[j+1,lane+1]]){
        const d=across/4*path.width-half;
        corners.push([a[0]+(b[0]-a[0])*advance/steps+nx*d,a[1]+(b[1]-a[1])*advance/steps+ny*d]);
      }
      points.push(corners[0],corners[1],corners[2],corners[2],corners[1],corners[3]);
    }
    parts.push(surface(points,path.color,.025));
    for(let j=1;j<steps;j+=3){
      const x=a[0]+(b[0]-a[0])*j/steps,y=a[1]+(b[1]-a[1])*j/steps;
      for(const side of [-1,1]){
        const ex=x+nx*(half-.15)*side,ey=y+ny*(half-.15)*side;
        parts.push(orb(ex,tiltFloor(ex,ey,{bridgeOpen:true}).height+.075,-ey,.13,.065,.13,CREAM));
      }
    }
  }
  for(const p of path.points){
    const points=[];
    for(let i=0;i<32;i++){
      const a=i*Math.PI/16,b=(i+1)*Math.PI/16;
      points.push([p[0],p[1]],[p[0]+Math.cos(a)*half,p[1]+Math.sin(a)*half],[p[0]+Math.cos(b)*half,p[1]+Math.sin(b)*half]);
    }
    parts.push(surface(points,path.color,.02));
  }
  return parts;
}

export class TiltRun {
  scene; #rules=new TiltRules(); #board=new THREE.Group(); #world=new THREE.Group();
  #bubble=new THREE.Group(); #roll=new THREE.Group(); #hero; #rim; #shell; #brake; #shadow;
  #foam; #foamBubbles=[]; #basinRing; #flags=[]; #towel; #finish; #finishMat; #time=0; #floaters=[];

  constructor(art){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xcdeaf0);this.scene.fog=new THREE.Fog(0xcdeaf0,55,120);
    this.#buildBath();
    this.scene.add(new THREE.HemisphereLight(0xfff6df,0x8597b2,2.3));
    const light=new THREE.DirectionalLight(0xfff6e2,2.5);light.position.set(-15,30,15);this.scene.add(light);
    this.scene.add(this.#board);this.#board.add(this.#world);
    const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    this.#buildWorld(material);this.#buildBubble(art);
    this.reset();
  }

  #buildWorld(material){
    const parts=[];
    for(const path of TILT_PATHS){
      if(!path.requiresFoam){parts.push(...road(path));continue;}
      this.#foam=batch(road(path),material.clone());this.#world.add(this.#foam);
    }
    for(const room of tiltCourse().rooms){
      const points=[],sides=[];
      for(let ring=0;ring<8;ring++)for(let i=0;i<48;i++){
        const corners=[];
        for(const [radius,angle] of [[ring,i],[ring+1,i],[ring,i+1],[ring+1,i+1]])
          corners.push([room.x+Math.cos(angle*Math.PI/24)*radius*room.radius/8,room.y+Math.sin(angle*Math.PI/24)*radius*room.radius/8]);
        points.push(corners[0],corners[1],corners[2],corners[2],corners[1],corners[3]);
        if(ring!==7)continue;
        const a=corners[1],b=corners[3],ah=tiltFloor(...a,{bridgeOpen:true}).height,bh=tiltFloor(...b,{bridgeOpen:true}).height;
        sides.push(a[0],ah,-a[1],a[0],ah-.7,-a[1],b[0],bh,-b[1],b[0],bh,-b[1],a[0],ah-.7,-a[1],b[0],bh-.7,-b[1]);
      }
      parts.push(surface(points,room.id==='basin'?0xb7dcd5:CREAM,.055));
      const side=new THREE.BufferGeometry();side.setAttribute('position',new THREE.Float32BufferAttribute(sides,3));side.computeVertexNormals();parts.push(paint(side,0xd2baa2));
      for(const side of [-1,1])parts.push(orb(room.x+side*(room.radius+1),room.height-1.2,-room.y,3.3,.8,2.5,0xe6edf0));
    }
    // Loose soap clouds mark height without obscuring any driving surface.
    for(let y=16;y<155;y+=12)for(const side of [-1,1]){
      const x=side*(25+Math.sin(y)*3);parts.push(orb(x,-3,-y,4.5,1.2,3.6,0xecf0e8));
      if(y<65)parts.push(cylinder(x,-.5,-y,.15,3.2,INK),orb(x,1.2,-y,1.3,1.7,1.3,side<0?0xe7becd:0xbccee3));
    }
    this.#world.add(batch(parts,material));
    for(const checkpoint of TILT_CHECKPOINTS){
      const flag=new THREE.Group();flag.position.set(checkpoint.x,checkpoint.height,-checkpoint.y);this.#world.add(flag);
      flag.add(batch([cylinder(-4,2,0,.14,4,INK),paint(new THREE.BoxGeometry(1.8,.9,.06).translate(-3.1,3.35,0),GOLD)],material));
      const ring=new THREE.Mesh(new THREE.TorusGeometry(3.25,.13,6,48),new THREE.MeshBasicMaterial({color:0xe7bb62}));
      ring.rotation.x=-Math.PI/2;ring.position.y=.1;flag.add(ring);this.#flags.push({ring,index:checkpoint.index});
      const label=sign(String(checkpoint.index),1.25);label.position.set(-3.1,3.35,.08);flag.add(label);
    }
    const b=TILT_BASIN,h=tiltFloor(b.x,b.y).height;
    this.#basinRing=new THREE.Mesh(new THREE.TorusGeometry(b.radius-.15,.18,8,48),new THREE.MeshBasicMaterial({color:0x6dabc1}));
    this.#basinRing.rotation.x=-Math.PI/2;this.#basinRing.position.set(b.x,h+.15,-b.y);this.#world.add(this.#basinRing);
    for(let i=0;i<8;i++){
      const bubble=new THREE.Mesh(new THREE.SphereGeometry(.6,12,8),new THREE.MeshPhongMaterial({color:0xf7f2d9,transparent:true,opacity:.75,shininess:80}));
      bubble.position.set(b.x+Math.cos(i)*3,h+.65,-b.y+Math.sin(i)*3);this.#world.add(bubble);this.#foamBubbles.push(bubble);
    }
    const f=TILT_FINISH;
    this.#finish=new THREE.Mesh(new THREE.CircleGeometry(3.8,48),new THREE.MeshBasicMaterial({color:0xe7c99b,side:THREE.DoubleSide}));
    this.#finish.rotation.x=-Math.PI/2;this.#finish.position.set(f.x,f.height+.12,-f.y);this.#world.add(this.#finish);
    const towel=paint(new THREE.BoxGeometry(8,.15,4.5).translate(0,-.2,0),0xf1dfbb);
    const stripes=[];for(let x=-3.4;x<=3.4;x+=.85)stripes.push(paint(new THREE.BoxGeometry(.24,.17,4.5).translate(x,-.18,0),0xb7d6d9));
    this.#towel=batch([towel,...stripes],material);this.scene.add(this.#towel);
    this.#finishMat=this.#towel.clone();this.#finishMat.position.set(f.x,f.height+.35,-f.y);this.#world.add(this.#finishMat);
  }

  #buildBath(){
    // Bath water far below, a soft sky over it, and soap bubbles drifting up past the camera.
    const dome=new THREE.SphereGeometry(260,32,16),colors=[],top=new THREE.Color(0x8fcbe8),low=new THREE.Color(0xf7dbe7),c=new THREE.Color();
    for(let i=0;i<dome.attributes.position.count;i++){
      const y=dome.attributes.position.getY(i)/260;c.copy(low).lerp(top,Math.max(0,y));colors.push(c.r,c.g,c.b);
    }
    dome.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.scene.add(new THREE.Mesh(dome,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false})));
    const water=new THREE.Mesh(new THREE.CircleGeometry(240,64).rotateX(-Math.PI/2),new THREE.MeshPhongMaterial({color:0x6fcad6,shininess:90,specular:0xe8fbff}));
    water.position.y=-9;this.scene.add(water);
    const shell=new THREE.SphereGeometry(1,20,14);
    for(let i=0;i<26;i++){
      const tint=[0xfbe3f0,0xdff4ff,0xfff5d6][i%3];
      const bubble=new THREE.Mesh(shell,new THREE.MeshPhongMaterial({color:tint,transparent:true,opacity:.3,shininess:120,specular:0xffffff,depthWrite:false}));
      bubble.userData={x:Math.cos(i*2.4)*(9+i%5*3),z:-6-(i*7.3)%38,size:.35+(i%4)*.22,speed:.5+(i%3)*.25,phase:i*1.7};
      this.scene.add(bubble);this.#floaters.push(bubble);
    }
  }

  #buildBubble(art){
    this.scene.add(this.#bubble);this.#bubble.add(this.#roll);
    this.#shell=new THREE.Mesh(new THREE.SphereGeometry(TILT.radius,24,16),new THREE.MeshPhongMaterial({color:0xc4eced,transparent:true,opacity:.16,shininess:110,depthWrite:false}));
    this.#bubble.add(this.#shell);
    this.#rim=new THREE.Mesh(new THREE.TorusGeometry(TILT.radius,.028,5,48),new THREE.MeshBasicMaterial({color:0x749fb5,transparent:true,opacity:.7,depthWrite:false}));this.#bubble.add(this.#rim);
    const stripe=new THREE.MeshBasicMaterial({color:CREAM,transparent:true,opacity:.64,depthWrite:false});
    for(const angle of [0,Math.PI/2]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(TILT.radius,.023,5,40),stripe);ring.rotation.y=angle;this.#roll.add(ring);
    }
    this.#hero=buildMirio(art);this.#hero.group.scale.setScalar(.58);this.#hero.group.position.y=-.67;
    this.#hero.legL.rotation.x=this.#hero.legR.rotation.x=-.45;this.#hero.armL.rotation.x=this.#hero.armR.rotation.x=-.75;this.#bubble.add(this.#hero.group);
    this.#brake=new THREE.Mesh(new THREE.TorusGeometry(1.02,.07,6,40),new THREE.MeshBasicMaterial({color:GOLD}));
    this.#brake.rotation.x=-Math.PI/2;this.#brake.position.y=.08;this.scene.add(this.#brake);
    this.#shadow=new THREE.Mesh(new THREE.CircleGeometry(.9,24),new THREE.MeshBasicMaterial({color:INK,transparent:true,opacity:.2,depthWrite:false}));
    this.#shadow.rotation.x=-Math.PI/2;this.#shadow.position.y=.08;this.scene.add(this.#shadow);
  }

  reset(){this.#time=0;this.#roll.rotation.set(0,0,0);return this.#rules.reset();}
  step(dt,input){return this.#rules.step(dt,input);}
  rescue(){return this.#rules.rescue();}
  seek(target){return this.#rules.seek(target);}
  snapshot(){return {...this.#rules.snapshot(),name:'Seifenstern'};}
  layout(){return this.#rules.layout();}

  render(camera,dt=0,{reducedMotion=false}={}){
    dt=Math.max(0,Math.min(dt,.1));this.#time+=dt;const r=this.#rules.snapshot(),t=this.#time;
    // Pivot the visible board beneath Mirio. The camera never rolls with the board.
    this.#world.position.set(-r.x,-r.height,r.y);
    const visualTilt=reducedMotion?.2:.72;this.#board.rotation.set(-r.tiltY*visualTilt,0,-r.tiltX*visualTilt);
    const catchLift=r.recovering>0?Math.sin(r.recovering/TILT.recoveryTime*Math.PI)*1.4:0;
    this.#bubble.position.set(0,TILT.radius+catchLift-r.gutter*3,0);
    this.#shadow.visible=r.gutter===0&&r.recovering===0;
    this.#towel.visible=r.recovering>0;this.#towel.position.y=catchLift;
    this.#hero.group.rotation.y=r.speed>.2?Math.atan2(r.vx,-r.vy):0;
    this.#hero.body.rotation.z=reducedMotion?0:-r.tiltX;this.#hero.body.rotation.x=reducedMotion?0:-r.tiltY;
    if(!reducedMotion){this.#roll.rotation.x-=r.vy*dt/TILT.radius;this.#roll.rotation.z-=r.vx*dt/TILT.radius;}
    this.#brake.visible=r.braking;this.#shell.material.opacity=r.braking?.26:.16;
    this.#foam.visible=r.bridgeOpen||r.bridgeCharge>0;this.#foam.material.transparent=!r.bridgeOpen;
    this.#foam.material.opacity=r.bridgeOpen?1:.15+r.bridgeCharge*.6;
    this.#basinRing.material.color.setHex(r.bridgeOpen?0xe9c568:r.braking&&r.basinNear?0xffffff:0x6dabc1);
    for(const [i,bubble] of this.#foamBubbles.entries()){
      const scale=.45+(r.bridgeOpen?.65:r.bridgeCharge*.85);bubble.scale.setScalar(scale);
      bubble.position.y=TILT_CHECKPOINTS[1].height+.4+(reducedMotion?0:Math.sin(t*2+i)*.14)+r.bridgeCharge*.5;
    }
    for(const {ring,index} of this.#flags)ring.material.color.setHex(r.checkpoint>=index?0x9ec9a6:0xe7bb62);
    this.#finish.material.color.setHex(r.status==='finished'?0xffef9c:r.finishReady?0xf5d991:0xe7c99b);
    this.#finishMat.scale.z=r.status==='finished'&&!reducedMotion?1.35+Math.sin(t*3)*.05:1;
    for(const bubble of this.#floaters){
      const b=bubble.userData,rise=reducedMotion?0:(t*b.speed+b.phase)%14;
      bubble.position.set(b.x+(reducedMotion?0:Math.sin(t*.7+b.phase)*.6),-6+rise,b.z);bubble.scale.setScalar(b.size);
    }
    // Low behind Mirio, so the paths ahead and the tilt of the world both read.
    const portrait=camera.aspect<1;
    if(camera.fov!==50){camera.fov=50;camera.updateProjectionMatrix();}
    camera.position.set(0,portrait?15:10.5,portrait?16:12.5);camera.up.copy(UP);camera.lookAt(0,0,-7.5);
    this.#rim.quaternion.copy(camera.quaternion);
  }
}
