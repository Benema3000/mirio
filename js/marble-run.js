// A connected musical toy board. The bubble carries Miro's unchanged character.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildMirio} from './mirio-model.js';
import {MARBLE, MARBLE_ROOMS, MARBLE_PATHS, MARBLE_BELLS, MARBLE_BUMPERS,
  MarbleRules, bumperBeat, marbleHeight} from './marble-rules.js';

const CREAM=0xffefcb,INK=0x405267,GOLD=0xefc669;
const UP=new THREE.Vector3(0,1,0);
const paint=(geometry,color)=>{
  const value=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3)value.toArray(colors,i);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');return geometry;
};
const orb=(x,y,z,sx,sy,sz,color)=>paint(new THREE.SphereGeometry(1,12,8).scale(sx,sy,sz).translate(x,y,z),color);
const cylinder=(x,y,z,r,h,color)=>paint(new THREE.CylinderGeometry(r,r,h,24).translate(x,y,z),color);
function batch(parts,material){
  const flat=parts.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(flat);
  for(const g of new Set([...parts,...flat]))g.dispose();return new THREE.Mesh(geometry,material);
}
function sign(text,width=5){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff3d9';ctx.beginPath();ctx.roundRect(4,4,504,120,26);ctx.fill();
  ctx.fillStyle='#405267';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 58px sans-serif';ctx.fillText(text,256,66);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false}));sprite.scale.set(width,width/4,1);return sprite;
}
function noteGlyph(text,color){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle=`#${color.toString(16)}`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 100px sans-serif';ctx.strokeStyle='#fff4d9';ctx.lineWidth=7;ctx.strokeText(text,64,65);ctx.fillText(text,64,65);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false}));sprite.scale.set(1.25,1.25,1);return sprite;
}
function ribbon(points,width,color,lift=0){
  const positions=[],indices=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/length,ny=(b[0]-a[0])/length;
    for(const side of [-1,1]){
      const x=p[0]+nx*width/2*side,y=p[1]+ny*width/2*side;
      positions.push(x,marbleHeight(x,y)+lift,-y);
    }
    if(i){const n=i*2;indices.push(n-2,n-1,n,n-1,n+1,n);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return paint(geometry,color);
}
function stations(points){
  const result=[];
  for(let i=1;i<points.length;i++){
    const [ax,ay]=points[i-1],[bx,by]=points[i],steps=Math.ceil(Math.hypot(bx-ax,by-ay));
    for(let j=0;j<steps;j++)result.push([ax+(bx-ax)*j/steps,ay+(by-ay)*j/steps]);
  }
  result.push(points.at(-1));return result;
}

export class MarbleRun {
  scene; #rules=new MarbleRules(); #hero; #bubble; #shell; #rim; #shadow; #roll=new THREE.Group();
  #bells=[]; #bumpers=[]; #notes=[]; #pulse; #brake; #drum; #homeArrow; #wake=new Map();
  #elapsed=0; #cameraReady=false; #focus=new THREE.Vector3(); #finishPetals=[];

  constructor(art){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xbedee5);
    this.scene.fog=new THREE.Fog(0xbedee5,75,135);
    this.scene.add(new THREE.HemisphereLight(0xfff7df,0x7898ae,2.25));
    const light=new THREE.DirectionalLight(0xfff2d8,2.6);light.position.set(-20,35,12);this.scene.add(light);
    const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    this.#buildBoard(material);this.#buildBells(material);this.#buildBumpers(material);this.#buildDrum(material);
    this.#bubble=new THREE.Group();this.scene.add(this.#bubble);this.#bubble.add(this.#roll);
    this.#shell=new THREE.Mesh(new THREE.SphereGeometry(MARBLE.radius,24,16),new THREE.MeshPhongMaterial({color:0xc5edf5,
      transparent:true,opacity:.14,shininess:100,specular:0xffffff,depthWrite:false}));
    this.#bubble.add(this.#shell);
    this.#rim=new THREE.Mesh(new THREE.TorusGeometry(MARBLE.radius,.026,5,48),new THREE.MeshBasicMaterial({color:0x759eb5,transparent:true,opacity:.7,depthWrite:false}));
    this.#bubble.add(this.#rim);
    this.#shadow=new THREE.Mesh(new THREE.CircleGeometry(.95,24),new THREE.MeshBasicMaterial({color:0x596d85,transparent:true,opacity:.18,depthWrite:false}));
    this.#shadow.rotation.x=-Math.PI/2;this.scene.add(this.#shadow);
    const stripe=new THREE.MeshBasicMaterial({color:0xfff9de,transparent:true,opacity:.66,depthWrite:false});
    for(const tilt of [0,Math.PI/2]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(MARBLE.radius,.025,5,40),stripe);ring.rotation.y=tilt;this.#roll.add(ring);
    }
    this.#hero=buildMirio(art);this.#hero.group.scale.setScalar(.58);this.#hero.group.position.y=-.67;
    this.#hero.legL.rotation.x=this.#hero.legR.rotation.x=-.45;this.#hero.armL.rotation.x=this.#hero.armR.rotation.x=-.75;
    this.#bubble.add(this.#hero.group);
    this.#pulse=new THREE.Mesh(new THREE.RingGeometry(.94,1,48),new THREE.MeshBasicMaterial({color:0xffef9c,side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false}));
    this.#pulse.rotation.x=-Math.PI/2;this.scene.add(this.#pulse);
    this.#brake=new THREE.Mesh(new THREE.TorusGeometry(1.1,.05,5,40),new THREE.MeshBasicMaterial({color:0xffdf7c}));
    this.#brake.rotation.x=-Math.PI/2;this.scene.add(this.#brake);
    this.#homeArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),3,GOLD,.85,.6);
    this.scene.add(this.#homeArrow);
    for(const bell of MARBLE_BELLS){
      const note=noteGlyph(bell.note,bell.color);this.scene.add(note);this.#notes.push({id:bell.id,object:note});
    }
    this.reset();
  }

  #buildBoard(material){
    const parts=[];
    for(const path of MARBLE_PATHS){
      const points=stations(path.points),color=path.bank?0xeec576:path.id.includes('rose')?0xe9b8c7:path.id.includes('blue')?0xa4cddb:0xbcd3b0;
      parts.push(ribbon(points,path.width+.35,0xe5c795,-.22),ribbon(points,path.width,color,.015));
      for(const [x,y]of path.points)parts.push(cylinder(x,marbleHeight(x,y),-y,path.width/2,.06,color));
      parts.push(ribbon(points,.18,CREAM,.032));
      for(const [x,y]of points.filter((_,i)=>i%3===0))parts.push(orb(x,marbleHeight(x,y)+.04,-y,.21,.03,.21,CREAM));
    }
    for(const room of MARBLE_ROOMS){
      parts.push(cylinder(room.x,-.48,-room.y,room.radius,.9,0xe1ba91),cylinder(room.x,.025,-room.y,room.radius,.09,room.color));
      const rim=paint(new THREE.TorusGeometry(room.radius-.25,.1,6,48).rotateX(Math.PI/2).translate(room.x,.08,-room.y),CREAM);parts.push(rim);
      // Music-box feet make the separate rooms read as one connected table.
      for(const side of [-1,1])parts.push(cylinder(room.x+side*room.radius*.6,-2.2,-room.y,.48,3.6,0xbc9b80));
    }
    for(const side of [-1,1])for(let y=12;y<58;y+=8){
      const x=side*(29+Math.sin(y)*2);
      parts.push(orb(x,-2,-y,3,1.3,2.6,0xe6efdf));
      parts.push(cylinder(x,-.1,-y,.18,3.1,0xb59a85),orb(x,1.5,-y,1.4,1.7,1.1,side<0?0xd9b7cd:0xadc8de));
    }
    this.scene.add(batch(parts,material));
    for(const [text,x,y,width]of [['♪  +  ⏸',0,10,4],['← ♪    ♬ ↑    ♫ →',0,21,7],['↗  ♬',-18,38,3.6],['♬  ↖',18,38,3.6],['3 ♪ → 🥁',0,5,4.2]]){
      const board=sign(text,width);board.position.set(x,1.1,-y);this.scene.add(board);
    }
    const bank=sign('↕ ♫',3);bank.position.set(-3,2.4,-34);this.scene.add(bank);
  }

  #buildBells(material){
    for(const bell of MARBLE_BELLS){
      const group=new THREE.Group();group.position.set(bell.x,0,-bell.y);this.scene.add(group);
      const parts=[cylinder(-1.5,1.75,0,.15,3.5,CREAM),cylinder(1.5,1.75,0,.15,3.5,CREAM),
        paint(new THREE.TorusGeometry(1.5,.16,7,32,Math.PI).translate(0,3.5,0),bell.color)];
      group.add(batch(parts,material));
      const bellMesh=batch([paint(new THREE.CylinderGeometry(.36,.79,.95,16).translate(0,2.95,0),bell.color),
        orb(0,2.4,0,.2,.24,.2,GOLD),paint(new THREE.TorusGeometry(.76,.06,5,24).rotateX(Math.PI/2).translate(0,2.48,0),CREAM)],material);
      group.add(bellMesh);const glyph=noteGlyph(bell.note,bell.color);glyph.scale.set(2,2,1);glyph.position.set(0,4.8,0);group.add(glyph);
      const target=new THREE.Mesh(new THREE.RingGeometry(2.8,3.25,40),new THREE.MeshBasicMaterial({color:bell.color,side:THREE.DoubleSide,transparent:true,opacity:.6}));
      target.rotation.x=-Math.PI/2;target.position.y=.09;group.add(target);
      this.#bells.push({spec:bell,group,bell:bellMesh,glyph,target});
    }
  }

  #buildBumpers(material){
    for(const bumper of MARBLE_BUMPERS){
      const group=new THREE.Group();group.position.set(bumper.x,0,-bumper.y);this.scene.add(group);
      group.add(batch([cylinder(0,.3,0,bumper.radius,.6,CREAM),orb(0,.73,0,bumper.radius,.65,bumper.radius,bumper.color),
        orb(-.27,1.23,.36,.1,.05,.11,INK),orb(.27,1.23,.36,.1,.05,.11,INK)],material));
      const ring=new THREE.Mesh(new THREE.TorusGeometry(bumper.radius+.14,.08,6,32),new THREE.MeshBasicMaterial({color:0xffefa3}));
      ring.rotation.x=-Math.PI/2;ring.position.y=.75;group.add(ring);this.#bumpers.push({spec:bumper,group,ring});
    }
  }

  #buildDrum(material){
    const group=new THREE.Group();group.position.set(0,0,-4);this.scene.add(group);this.#drum=group;
    const face=new THREE.Mesh(new THREE.CircleGeometry(4.1,48),new THREE.MeshLambertMaterial({color:0xffefd0,side:THREE.DoubleSide}));
    face.rotation.x=-Math.PI/2;face.position.y=.09;group.add(face);
    group.add(batch([paint(new THREE.TorusGeometry(4.25,.12,6,48).rotateX(Math.PI/2).translate(0,.13,0),GOLD)],material));
    for(let i=0;i<12;i++){
      const angle=i*Math.PI/6,petal=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),new THREE.MeshLambertMaterial({color:MARBLE_BELLS[i%3].color}));
      petal.position.set(Math.cos(angle)*4.65,.1,Math.sin(angle)*4.65);petal.scale.set(.9,.16,.5);petal.rotation.y=-angle;
      group.add(petal);this.#finishPetals.push(petal);
    }
  }

  reset(){this.#elapsed=0;this.#cameraReady=false;this.#wake.clear();this.#roll.rotation.set(0,0,0);return this.#rules.reset();}
  step(dt,input){
    const events=this.#rules.step(dt,input);
    for(const event of events)if(event.type==='marble-bumper')this.#wake.set(event.id,.6);
    return events;
  }
  rescue(){this.#cameraReady=false;return this.#rules.rescue();}
  seek(progress){this.#cameraReady=false;return this.#rules.seek(progress);}
  snapshot(){return {...this.#rules.snapshot(),name:'Klangkugel'};}
  layout(){return this.#rules.layout();}

  render(camera,dt=0,{reducedMotion=false}={}){
    dt=Math.max(0,Math.min(dt,.1));this.#elapsed+=dt;const r=this.#rules.snapshot(),t=this.#elapsed;
    const recover=r.recovering>0?Math.sin(r.recovering/MARBLE.recoveryTime*Math.PI)*1.2:0;
    this.#bubble.position.set(r.x,r.height+MARBLE.radius+recover-r.gutter*2.1,-r.y);
    this.#shadow.position.set(r.x,r.height+.11,-r.y);this.#shadow.visible=r.gutter===0;
    if(!reducedMotion){this.#roll.rotation.x-=r.vy*dt/MARBLE.radius;this.#roll.rotation.z-=r.vx*dt/MARBLE.radius;}
    this.#hero.group.rotation.y=r.speed>.2?Math.atan2(r.vx,-r.vy):0;
    this.#hero.body.rotation.z=reducedMotion?0:-r.vx*.035;
    this.#hero.body.rotation.x=reducedMotion?0:-r.vy*.035;
    this.#shell.material.opacity=r.braking?.24:.14;
    this.#brake.visible=r.braking;this.#brake.position.set(r.x,r.height+.12,-r.y);
    this.#homeArrow.visible=r.finishReady&&r.status!=='finished';
    if(r.returnTarget){
      this.#homeArrow.position.set(r.x,r.height+.22,-r.y);
      const direction=new THREE.Vector3(r.returnTarget.x-r.x,0,r.y-r.returnTarget.y);
      if(direction.lengthSq()>.01)this.#homeArrow.setDirection(direction.normalize());
    }
    this.#pulse.visible=r.pulse>0;this.#pulse.position.set(r.x,r.height+.14,-r.y);
    this.#pulse.scale.setScalar(1+(1-r.pulse/MARBLE.pulseTime)*4);this.#pulse.material.opacity=r.pulse;
    for(const {id,object}of this.#notes){
      const index=r.noteIds.indexOf(id);object.visible=index>=0;
      if(index<0)continue;
      const angle=(reducedMotion?0:t)*.8+index*Math.PI*2/3;
      object.position.set(r.x+Math.cos(angle)*1.55,r.height+1.65,-r.y+Math.sin(angle)*1.55);
    }
    for(const item of this.#bells){
      const collected=r.noteIds.includes(item.spec.id);item.target.material.opacity=collected?.13:.58;
      item.glyph.material.opacity=collected?.45:1;
      item.bell.rotation.z=reducedMotion?0:Math.sin(t*(collected?3:1.5))*(collected?.17:.035);
    }
    for(const item of this.#bumpers){
      const wake=Math.max(0,(this.#wake.get(item.spec.id)||0)-dt);this.#wake.set(item.spec.id,wake);
      const beat=bumperBeat(r.time,item.spec),stretch=reducedMotion?1:1+beat.anticipation*.16+(wake>0?Math.sin(wake*14)*.13:0);
      item.group.scale.set(1,stretch,1);item.ring.material.color.setHex(beat.active||wake>0?0xffffff:0xffefa3);
      item.ring.scale.setScalar(beat.active?1.12:1);
    }
    for(const [i,petal]of this.#finishPetals.entries()){
      petal.visible=r.finishReady;petal.position.y=r.status==='finished'&&!reducedMotion?.35+Math.sin(t*4+i)*.2:.1;
    }
    const target=new THREE.Vector3(r.x,0,-r.y-3);
    if(!this.#cameraReady){this.#focus.copy(target);this.#cameraReady=true;}
    this.#focus.lerp(target,1-Math.exp(-dt*6));
    const portrait=camera.aspect<1,height=portrait?34:22,behind=portrait?20:16;
    if(camera.fov!==48){camera.fov=48;camera.updateProjectionMatrix();}
    camera.position.set(this.#focus.x,this.#focus.y+height,this.#focus.z+behind);camera.up.copy(UP);camera.lookAt(this.#focus);
    this.#rim.quaternion.copy(camera.quaternion);
  }
}
