// An original flower-ribbon diorama. Mirio is the unchanged drawing-based toy.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildMirio } from './mirio-model.js';
import { GARDEN } from './garden-course.js';
import { RIBBON, RibbonRules, makeRibbonCourse, platformAt, critterAt } from './ribbon-rules.js';

const PALETTE=[
  {turf:0x86b74e,edge:0xc4dd6b,soil:0xcf9774,flower:0xf28aa7,leaf:0x639b62},
  {turf:0x70b994,edge:0xb8e4a3,soil:0xc89c81,flower:0xffcf66,leaf:0x549c8e},
  {turf:0x98b562,edge:0xe0dc84,soil:0xce9a87,flower:0xce9be0,leaf:0x6d9b78},
  {turf:0x88baa3,edge:0xc3e5b7,soil:0xd29f84,flower:0xff9d89,leaf:0x589b90},
  {turf:0x94b966,edge:0xe0e798,soil:0xd7a493,flower:0xf29ebd,leaf:0x699f76},
];
function random(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function tint(hex,k){return new THREE.Color(hex).multiplyScalar(k);}
const UP=new THREE.Vector3(0,1,0);

/** A handful of shared geometry/material batches per 40m segment. */
class GardenBatch {
  constructor(scene){
    this.scene=scene;this.pending=new Map();this.chunks=[];
    this.geometries={box:new RoundedBoxGeometry(1,1,1,2,.055),orb:new THREE.SphereGeometry(1,10,7),
      stem:new THREE.CylinderGeometry(1,1,1,7),cone:new THREE.ConeGeometry(1,1,8),
      petal:new THREE.SphereGeometry(1,8,5),stone:new THREE.IcosahedronGeometry(1,0)};
    this.material=new THREE.MeshPhongMaterial({color:0xffffff,shininess:25,specular:0x27343a});
    this.dummy=new THREE.Object3D();this.color=new THREE.Color();
  }
  add(kind,x,y,z,sx,sy,sz,color,rz=0,ry=0){
    const chunk=Math.floor(x/40),key=`${chunk}/${kind}`;
    if(!this.pending.has(key))this.pending.set(key,{chunk,kind,items:[]});
    this.pending.get(key).items.push({x,y,z,sx,sy,sz,color,rz,ry});
  }
  rod(x1,y1,z1,x2,y2,z2,r,color){
    const a=new THREE.Vector3(x1,y1,z1),b=new THREE.Vector3(x2,y2,z2),d=b.clone().sub(a),q=new THREE.Quaternion().setFromUnitVectors(UP,d.clone().normalize());
    const chunk=Math.floor(x1/40),key=`${chunk}/stem`;
    if(!this.pending.has(key))this.pending.set(key,{chunk,kind:'stem',items:[]});
    this.pending.get(key).items.push({x:(x1+x2)/2,y:(y1+y2)/2,z:(z1+z2)/2,sx:r,sy:d.length(),sz:r,color,q});
  }
  finish(){
    const chunkGroups=new Map();
    for(const {chunk,kind,items}of this.pending.values()){
      if(!chunkGroups.has(chunk)){const group=new THREE.Group();this.scene.add(group);chunkGroups.set(chunk,group);this.chunks.push({center:chunk*40+20,group});}
      const mesh=new THREE.InstancedMesh(this.geometries[kind],this.material,items.length);
      items.forEach((s,i)=>{
        this.dummy.position.set(s.x,s.y,s.z);this.dummy.scale.set(s.sx,s.sy,s.sz);
        this.dummy.rotation.set(0,s.ry||0,s.rz||0);if(s.q)this.dummy.quaternion.copy(s.q);
        this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);mesh.setColorAt(i,this.color.set(s.color));
      });
      mesh.computeBoundingSphere();chunkGroups.get(chunk).add(mesh);
    }
    this.pending.clear();return this.chunks;
  }
}

function mesh(group,geometry,material,position,scale){
  const m=new THREE.Mesh(geometry,material);if(position)m.position.set(...position);if(scale)m.scale.set(...scale);group.add(m);return m;
}
function label(text,sub,color='#35535b',width=512){
  const c=document.createElement('canvas');c.width=width;c.height=192;const ctx=c.getContext('2d');
  ctx.fillStyle='#fff8df';ctx.beginPath();ctx.roundRect(5,5,width-10,182,28);ctx.fill();
  ctx.strokeStyle='#d3bc8a';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle=color;ctx.textAlign='center';
  ctx.font='bold 48px system-ui, sans-serif';ctx.fillText(text,width/2,80);
  ctx.font='26px system-ui, sans-serif';ctx.fillText(sub,width/2,132);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map,transparent:true,side:THREE.DoubleSide});
}

export class RibbonRun {
  constructor(art){
    this.course=makeRibbonCourse();this.rules=new RibbonRules(this.course);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xc0e8ec);
    this.scene.fog=new THREE.Fog(0xc0e8ec,37,110);
    this.scene.add(new THREE.HemisphereLight(0xfff8e5,0x7b8498,2.1));
    const sun=new THREE.DirectionalLight(0xffe7bc,2.5);sun.position.set(-15,25,20);this.scene.add(sun);
    const fill=new THREE.DirectionalLight(0xbfeff6,.75);fill.position.set(12,7,-10);this.scene.add(fill);
    this.materials={
      cream:new THREE.MeshPhongMaterial({color:0xfff3d0,shininess:30}),
      green:new THREE.MeshPhongMaterial({color:0x73b67d,shininess:25}),
      pink:new THREE.MeshPhongMaterial({color:0xef9bb5,shininess:45,specular:0x735353}),
      teal:new THREE.MeshPhongMaterial({color:0x47b7bc,shininess:55}),
      wood:new THREE.MeshPhongMaterial({color:0x977257,shininess:15}),
      white:new THREE.MeshPhongMaterial({color:0xfffdf0,shininess:35}),
      dark:new THREE.MeshPhongMaterial({color:0x314251,shininess:35}),
      gold:new THREE.MeshPhongMaterial({color:0xffd06c,shininess:65,specular:0xaaa064}),
    };
    this.sphere=new THREE.SphereGeometry(1,14,10);this.cylinder=new THREE.CylinderGeometry(1,1,1,10);
    this.box=new RoundedBoxGeometry(1,1,1,3,.1);
    const batch=new GardenBatch(this.scene);
    this._landscape(batch);this._backdrop(batch);this._gardenLandmarks(batch);this.chunks=batch.finish();
    this._movingPlatforms();this._springs();this._checkpoints();this._critters();this._gems();this._finish();this._gardenToys();this._particles();
    this.hero=buildMirio(art);this.scene.add(this.hero.group);
    const shadowMat=new THREE.MeshBasicMaterial({map:art.shadow||null,color:0x355867,transparent:true,opacity:.24,depthWrite:false});
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.8),shadowMat);this.shadow.rotation.x=-Math.PI/2;this.scene.add(this.shadow);
    this.recoveryCloud=new THREE.Group();
    for(let i=0;i<5;i++)mesh(this.recoveryCloud,this.sphere,this.materials.white,[(i-2)*.42,-.12+Math.sin(i)*.05,0],[.51,.23,.5]);
    this.scene.add(this.recoveryCloud);this.recoveryCloud.visible=false;
    this.cameraX=this.rules.x;this.cameraY=1;this.cameraReady=false;this.animationTime=0;this.particleCursor=0;
    this.reset();
  }
  _landscape(b){
    const rand=random(6037);
    for(const p of this.course.platforms){
      const pal=PALETTE[p.zone||0];
      if(p.kind==='ground'){
        b.add('box',p.x,p.y-2.8,0,p.w,5.5,6.7,pal.soil);
        b.add('box',p.x,p.y-.23,0,p.w+.08,.47,6.95,pal.turf);
        b.add('box',p.x,p.y-.025,0,p.w-.2,.08,3.65,0xe5d9a2);
        // Pale stepping-stone inlays break the path into a clear, welcoming line.
        for(let x=p.x-p.w/2+1.1;x<p.x+p.w/2-1;x+=1.9){
          b.add('box',x,p.y+.026,rand()*.15-.075,.91,.026,.72,0xf8e9bf,0,(rand()-.5)*.2);
          if(rand()>.48)this._flowerBed(b,x,p.y,2.4+rand()*.6,pal,rand);
        }
        // Scalloped front edge and seed-shaped stones in the earth strata.
        for(let x=p.x-p.w/2+.45;x<p.x+p.w/2;x+=.82){
          b.add('orb',x,p.y-.27,3.27,.57,.28,.28,rand()>.5?pal.edge:pal.turf);
          if(rand()>.5)b.add('stone',x,p.y-1.3-rand()*2,3.34,.14+rand()*.18,.13,.055,0xf5d5a3,rand());
        }
        for(let x=p.x-p.w/2+3;x<p.x+p.w/2-1.5;x+=5.5+rand()*2){
          if(p.zone<2)this._tree(b,x,p.y,-2.5,1+rand()*.36,pal,rand);
          this._flowerBed(b,x+1.5,p.y,-2.8,pal,rand);
        }
      }else if(p.kind==='petal'){
        b.add('box',p.x,p.y-.15,0,p.w,.3,3.0,0xb3d797);
        b.add('orb',p.x,p.y-.52,0,p.w*.49,.48,1.25,0xdbacba);
        for(let k=-2;k<=2;k++)b.add('petal',p.x+k*p.w/5,p.y-.2,1.32,.64,.21,.4,k%2?0xe9adc6:0xf9c5cd,-k*.1);
        b.add('stem',p.x,p.y-.83,0,.11,.5,.11,0x81aa7d);
      }
    }
    this._sign(3,1.1,-2.15,'← ♧   ✿   ☀ →','3 ✧ → ✿',4.9);
    this._sign(-23,1.1,-2.3,'♧ Baumhaus','↑ ✧',3.8);
    this._sign(46,1.1,-2.3,'☀ Glashaus','♪ ☀ ↔ ☾',3.8);
    this._sign(122,1.1,-2.3,'☾ Kellergarten','♪ ☀ ↔ ☾',4.1);
  }
  _flowerBed(b,x,y,z,pal,rand){
    for(let j=0;j<3;j++){
      const px=x+(rand()-.5)*.9,pz=z+(rand()-.5)*.5,h=.25+rand()*.5;
      b.add('stem',px,y+h*.5,pz,.023,h,.023,pal.leaf,Math.sin(j)*.09);
      b.add('petal',px-.10,y+h*.4,pz,.2,.06,.09,pal.leaf,.4);
      b.add('petal',px+.12,y+h*.6,pz,.19,.06,.09,pal.leaf,-.4);
      for(let k=0;k<5;k++){const a=k/5*Math.PI*2;b.add('petal',px+Math.sin(a)*.13,y+h+Math.cos(a)*.13,pz,.11,.16,.055,j%2?pal.flower:0xffebbc,-a);}
      b.add('orb',px,y+h,pz+.055,.085,.085,.046,0xe3ad4f);
    }
    for(let j=0;j<2;j++)b.add('petal',x+(j-.5)*.44,y+.15,z,.42,.21,.32,tint(pal.leaf,.9+j*.15),j*.2);
  }
  _tree(b,x,y,z,s,pal,rand){
    b.add('stem',x,y+1.45*s,z,.17*s,2.9*s,.17*s,0x987557,.06);
    b.rod(x,y+1.4*s,z,x-.68*s,y+2.3*s,z,.075*s,0x987557);
    b.rod(x,y+1.7*s,z,x+.7*s,y+2.7*s,z,.075*s,0x987557);
    for(let j=0;j<7;j++){
      const a=j*2.399,r=j===0?0:.7,px=x+Math.cos(a)*r*s,py=y+(2.8+Math.sin(a)*.5)*s,pz=z+Math.sin(a*1.6)*.45*s;
      b.add('orb',px,py,pz,.99*s,.96*s,.9*s,tint(pal.leaf,.87+rand()*.36));
      if(j%2===0)b.add('orb',px+.35*s,py-.48*s,pz+.75*s,.15*s,.17*s,.15*s,pal.flower);
    }
  }
  _sign(x,y,z,title,subtitle,width){
    const group=new THREE.Group();group.position.set(x,y,z);this.scene.add(group);
    mesh(group,this.cylinder,this.materials.wood,[0,-.4,0],[.07,2.1,.07]);
    mesh(group,new THREE.PlaneGeometry(width,width*.375),label(title,subtitle),[0,.72,.09]);
  }
  _backdrop(b){
    const rand=random(43536);
    for(let x=-130;x<230;x+=12){
      b.add('orb',x,-5,-37,18,13+rand()*9,9,rand()>.5?0xb2d7bc:0xb9d9c7);
      b.add('orb',x+5,-5,-24,13,8+rand()*7,7,rand()>.5?0x97c4ae:0xa1cbb5);
      if(rand()>.35){
        const y=10+rand()*7;
        for(let j=0;j<4;j++)b.add('orb',x+j*1.6,y+Math.sin(j)*.55,-30,2.1,.9+rand()*.5,1.2,0xf2f5de);
      }
    }
    // The creek and its glints sit below the garden, never obscuring a landing.
    for(let x=-120;x<230;x+=40)b.add('box',x+20,-5.6,-3,40,.15,30,0x83cace);
    for(let x=-100;x<200;x+=3.4)b.add('box',x,-5.49,-1-rand()*9,1+rand()*2,.015,.08,0xc5eeea,0,.1);
    // Tall seed stalks behind the route provide distinct landmarks in each act.
    for(const x of [-70,-31,20,71,149,178]){
      const pal=PALETTE[x<0?1:x<40?0:x<115?2:3];
      b.rod(x,-1,-9,x+1,8,-9,.14,pal.leaf);
      for(let j=0;j<7;j++){const a=j/7*Math.PI*2;b.add('petal',x+1+Math.sin(a)*1.1,8+Math.cos(a)*1.1,-9,.8,1.1,.3,pal.flower,-a);}
      b.add('orb',x+1,8,-8.65,.65,.65,.2,0xf5d07e);
      b.add('petal',x-1,3,-9,2,.42,.8,pal.leaf,.3);
    }
  }
  _gardenLandmarks(b){
    // Glass framing and a striped roof identify the conservatory from both paths.
    for(let x=52;x<=108;x+=8){
      b.rod(x,0,-3,x,9.8,-3,.10,0xf4edcf);
      b.rod(x,9.8,-3,x-3,11.4,-5,.10,0x769e94);
      b.add('box',x,9.9,-3,8,.16,.18,0xf4edcf);
    }
    b.add('box',79,4.5,-3.2,58,9,.08,0xb8d9c7);
    for(let x=53;x<108;x+=8)b.add('box',x,4.5,-3,7.4,.10,.2,0xf4edcf);
    // Cellar walls sit behind play: soft moonlight, oversized pots, and star windows.
    b.add('box',153,3.5,-4,70,9,.35,0x828eaf);
    for(let x=125;x<186;x+=11){
      b.add('box',x,3.5,-3.7,4,5,.2,0x465779);
      b.add('orb',x,4.5,-3.5,.9,.9,.08,0xffe2a6);
      b.add('box',x,3.5,-3.3,.12,5.1,.22,0xbebbc8);
      b.add('box',x,3.5,-3.3,4.1,.12,.22,0xbebbc8);
    }
    // A tree-house platform, ladder, and acorn lift advertise two ways up.
    b.add('stem',-70,3,-2.4,.75,6,.75,0x967050);
    b.add('box',-70,7.3,-2.8,13,2.2,2.3,0xdfbc83);
    b.add('cone',-70,10,-2.8,8,3,2.3,0xcc8f80);
    for(let y=.6;y<6;y+=.5)b.add('box',-79,y,-1.3,1.2,.1,.15,0xdbc39b);
    b.rod(-79.55,0,-1.3,-79.55,6,-1.3,.07,0x977257);
    b.rod(-78.45,0,-1.3,-78.45,6,-1.3,.07,0x977257);
    // Tiny footprints lead to a fluttering curtain and a hollow stump.
    for(let x=138;x<146;x+=.7)b.add('orb',x,6.44,(Math.floor(x/.7)%2?-.25:.25),.16,.025,.08,0xe9d7ac);
    b.add('stem',-87,1,-2,.9,2,.9,0xa57b59);
    b.add('orb',-87,1,-.98,.62,.8,.08,0x4d6260);
  }
  _gardenToys(){
    this.vines=[];this.seedToys=[];this.doors=[];this.songFlowers=[];this.spirits=[];
    for(const p of this.course.platforms.filter(p=>p.kind==='vine')){
      const group=new THREE.Group();group.position.set(p.x,p.y,0);this.scene.add(group);
      mesh(group,this.box,this.materials.green,[0,-.13,0],[p.w,.26,2.6]);
      for(let i=-2;i<=2;i++)mesh(group,this.sphere,this.materials.pink,[i*p.w/5,-.2,1.2],[.72,.25,.37]);
      mesh(group,this.cylinder,this.materials.green,[0,-p.y/2,-.3],[.065,p.y,.065]);
      this.vines.push({p,group});
    }
    for(const seed of this.course.seeds){
      const group=new THREE.Group();group.position.set(seed.x,seed.y,0);this.scene.add(group);
      mesh(group,this.sphere,this.materials.gold,[0,0,0],[.5,.65,.42]);
      for(const side of [-1,1])mesh(group,this.sphere,this.materials.green,[side*.27,.64,0],[.3,.11,.16]).rotation.z=side*.55;
      mesh(group,new THREE.TorusGeometry(.8,.045,5,24),this.materials.cream,[0,0,-.1]);
      this.seedToys.push({seed,group});
    }
    for(const door of this.course.doors){
      const group=new THREE.Group();group.position.set(door.x,door.y,-1);this.scene.add(group);
      const color=door.secret?this.materials.pink:this.materials.teal;
      mesh(group,this.box,color,[0,1.15,0],[1.8,2.4,.24]);
      mesh(group,this.box,this.materials.dark,[0,1.1,.18],[1.3,1.9,.10]);
      const curtain=mesh(group,this.box,color,[0,1.35,.3],[1.3,1.5,.12]);curtain.visible=!!door.secret;
      mesh(group,new THREE.PlaneGeometry(1.4,1.3),label(door.icon,'↻','#35535b',192),[0,3.15,.25]);
      mesh(group,this.sphere,this.materials.gold,[.5,1.1,.33],[.1,.1,.09]);
      this.doors.push({door,group,curtain});
    }
    for(const flower of this.course.flowers){
      const group=new THREE.Group();group.position.set(flower.x,flower.y,0);this.scene.add(group);
      mesh(group,this.cylinder,this.materials.green,[0,.72,0],[.08,1.44,.08]);
      const blossom=new THREE.Group();blossom.position.y=1.55;group.add(blossom);
      for(let i=0;i<6;i++){const a=i*Math.PI/3;mesh(blossom,this.sphere,this.materials.pink,[Math.sin(a)*.44,Math.cos(a)*.44,0],[.28,.34,.12]);}
      mesh(blossom,this.sphere,this.materials.gold,[0,0,.10],[.28,.28,.12]);
      mesh(group,new THREE.PlaneGeometry(2.4,1.44),label('♪  ↻','☀ ↔ ☾','#35535b',320),[0,3.05,0]);
      this.songFlowers.push({flower,group,blossom});
    }
    // These shy gardeners hum with the flower and water the lanterns you found.
    for(const [x,y]of [[61,0],[84,0],[140,0],[175,0]]){
      const group=new THREE.Group();this.scene.add(group);
      mesh(group,this.sphere,this.materials.white,[0,.75,0],[.64,.74,.48]);
      for(const side of [-1,1]){
        mesh(group,this.sphere,this.materials.dark,[side*.21,.91,.43],[.07,.08,.03]);
        mesh(group,this.sphere,this.materials.pink,[side*.39,.73,.40],[.10,.05,.03]);
      }
      const can=mesh(group,this.box,this.materials.teal,[.6,.52,.35],[.45,.38,.32]);
      mesh(group,this.cylinder,this.materials.teal,[.9,.58,.35],[.07,.38,.07]).rotation.z=-1;
      const water=mesh(group,this.cylinder,this.materials.teal,[1.04,.25,.35],[.024,.38,.024]);
      this.spirits.push({x,y,group,can,water});
    }
    this.seedSockets=new THREE.Group();this.seedSockets.position.set(17,1.1,-1.6);this.scene.add(this.seedSockets);
    this.lanterns=[];
    for(let i=0;i<GARDEN.seedCount;i++){
      mesh(this.seedSockets,this.cylinder,this.materials.wood,[(i-1)*1.5,.4,0],[.06,.8,.06]);
      this.lanterns.push(mesh(this.seedSockets,this.sphere,this.materials.cream,[(i-1)*1.5,1,0],[.43,.53,.36]));
    }
    mesh(this.seedSockets,new THREE.PlaneGeometry(4.8,1.8),label('✧ ✧ ✧','↓ ✿ ↑'),[0,3,0]);
    this.interactPrompt=mesh(this.scene,new THREE.PlaneGeometry(.9,.9),label('↻','','#35535b',192),[0,0,0]);
    this.guide=mesh(this.scene,new THREE.ConeGeometry(.25,.6,3),this.materials.gold,[0,0,0]);
    this.gardenBackground=new THREE.Color();
  }
  _renderGarden(dt,{reducedMotion}){
    const r=this.rules,t=this.animationTime,awake=r.dream===GARDEN.dreamAwake;
    this.gardenBackground.setHex(r.room().color);
    this.scene.background.lerp(this.gardenBackground,1-Math.exp(-dt*3));this.scene.fog.color.copy(this.scene.background);
    for(const {p,group}of this.vines)group.visible=r.platformActive(p)&&Math.abs(p.x-r.x)<42;
    for(const {seed,group}of this.seedToys){
      group.visible=!r.seeds.has(seed.id)&&Math.abs(seed.x-r.x)<42;
      group.position.y=seed.y+(reducedMotion?0:Math.sin(t*2)*.17);
      group.rotation.y=reducedMotion?0:Math.sin(t)*.3;
    }
    for(const {door,group,curtain}of this.doors){
      group.visible=Math.abs(door.x-r.x)<42;
      if(door.secret){curtain.scale.x=r.opened.has(door.id)?.18:.78+(reducedMotion?0:Math.sin(t*2.5)*.1);curtain.position.x=r.opened.has(door.id)?.55:0;}
    }
    for(const {flower,group,blossom}of this.songFlowers){
      group.visible=Math.abs(flower.x-r.x)<42;
      blossom.rotation.z=reducedMotion?0:Math.sin(t*2)*.1;
      blossom.scale.setScalar(awake?1:1.15);
    }
    for(const [index,spirit]of this.spirits.entries()){
      const {group,y,water,can}=spirit,x=r.gateOpen()?12+index*2.8:spirit.x;
      group.visible=Math.abs(x-r.x)<40;
      group.position.set(x,y+(reducedMotion?.1:.12+Math.sin(t*1.4+x)*.12),-.5);
      group.scale.y=awake?1:.7;group.rotation.z=reducedMotion?0:Math.sin(t+x)*.06;
      can.rotation.z=awake?-.3:0;water.visible=awake||r.seeds.size>0;
      water.scale.y=reducedMotion?1:.65+Math.sin(t*8+x)*.3;
    }
    this.lanterns.forEach((lantern,i)=>{lantern.material=i<r.seeds.size?this.materials.gold:this.materials.cream;});
    const interaction=r.interaction();this.interactPrompt.visible=!!interaction;
    if(interaction)this.interactPrompt.position.set(r.x,r.y+3.5,.25);
    const next=this.course.seeds.find(seed=>!r.seeds.has(seed.id));
    this.guide.visible=r.clock-r.lastDiscovery>GARDEN.hintDelay;
    if(this.guide.visible){
      const target=next||{x:GARDEN.finishX,y:GARDEN.finishY};
      this.guide.position.set(r.x,r.y+2.8,.2);this.guide.rotation.z=Math.atan2(-(target.x-r.x),target.y-r.y);
    }
  }
  _movingPlatforms(){
    this.movers=[];
    for(const p of this.course.platforms.filter(p=>p.kind==='cloud'||p.kind==='catch'||p.kind==='ghost')){
      const group=new THREE.Group();this.scene.add(group);
      for(let j=0;j<7;j++)mesh(group,this.sphere,this.materials.white,[(j-3)*p.w/7,-.23+(j%2)*.03,0],[p.w/7+.1,.33,.9]);
      mesh(group,this.box,this.materials.cream,[0,-.06,0],[p.w*.87,.14,1.5]);
      if(p.kind==='ghost'){
        for(const side of [-1,1])mesh(group,this.box,this.materials.dark,[side*.5,.12,.92],[.3,.055,.035]);
        mesh(group,this.sphere,this.materials.pink,[0,-.03,.94],[.13,.06,.03]);
      }
      this.movers.push({p,group});
    }
  }
  _springs(){
    this.flowers=[];
    for(const s of this.course.springs.filter(s=>!s.cloud)){
      const group=new THREE.Group();group.position.set(s.x,s.y,0);this.scene.add(group);
      const blossom=new THREE.Group();group.add(blossom);
      mesh(group,this.cylinder,this.materials.green,[0,.18,0],[.11,.36,.11]);
      mesh(group,this.sphere,this.materials.green,[-.32,.14,0],[.4,.08,.22]).rotation.z=.2;
      mesh(group,this.sphere,this.materials.green,[.32,.14,0],[.4,.08,.22]).rotation.z=-.2;
      for(let j=0;j<7;j++){const a=j/7*Math.PI*2;const petal=mesh(blossom,this.sphere,this.materials.pink,[Math.cos(a)*.51,.28,Math.sin(a)*.43],[.44,.13,.27]);petal.rotation.y=-a;}
      mesh(blossom,this.sphere,this.materials.gold,[0,.32,0],[.31,.16,.31]);
      // A little upward arrow is visible from the play camera.
      mesh(group,new THREE.ConeGeometry(.13,.24,3),this.materials.cream,[0,.54,.31]).rotation.y=Math.PI;
      this.flowers.push({s,group,blossom,pulse:0});
    }
  }
  _checkpoints(){
    this.flags=[];
    const cloth=new THREE.PlaneGeometry(.9,.58,5,1);
    for(const cp of this.course.checkpoints){
      const group=new THREE.Group();group.position.set(cp.x,cp.y,-1.58);this.scene.add(group);
      mesh(group,this.cylinder,this.materials.wood,[0,1.1,0],[.052,2.2,.052]);
      mesh(group,this.sphere,this.materials.gold,[0,2.23,0],[.11,.11,.11]);
      const mat=new THREE.MeshPhongMaterial({color:0xf3c79c,side:THREE.DoubleSide,shininess:15});
      const flag=mesh(group,cloth.clone(),mat,[.46,1.78,0]);
      this.flags.push({cp,group,flag});
    }
  }
  _critters(){
    this.critters=[];
    for(const c of this.course.critters){
      const group=new THREE.Group();this.scene.add(group);
      const body=new THREE.Group();group.add(body);
      mesh(body,this.sphere,this.materials.teal,[0,.42,0],[.52,.42,.4]);
      for(const side of [-1,1]){
        mesh(body,this.sphere,this.materials.cream,[side*.19,.52,.344],[.13,.16,.055]);
        mesh(body,this.sphere,this.materials.dark,[side*.19+.025,.53,.394],[.051,.069,.028]);
        mesh(body,this.sphere,this.materials.pink,[side*.37,.34,.315],[.085,.045,.025]);
        mesh(body,this.sphere,this.materials.gold,[side*.3,.10,.1],[.18,.12,.22]);
        const leaf=mesh(body,this.sphere,this.materials.green,[side*.15,.89,0],[.15,.32,.06]);leaf.rotation.z=-side*.58;
      }
      mesh(body,this.sphere,this.materials.cream,[0,.31,.39],[.06,.024,.025]);
      this.critters.push({c,group,body,bonk:0});
    }
  }
  _gems(){
    this.gemGeometry=new THREE.OctahedronGeometry(.28,0);
    this.gems=new THREE.InstancedMesh(this.gemGeometry,new THREE.MeshPhongMaterial({color:0xffffff,shininess:85,specular:0xa7aaaa}),this.course.gems.length);
    this.gems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.gems.frustumCulled=false;this.scene.add(this.gems);
    this.gemDummy=new THREE.Object3D();
    this.course.gems.forEach((g,i)=>this.gems.setColorAt(i,new THREE.Color(g.route==='blossom'||g.route==='cloud'?0xf3c0dd:0xffda78)));
  }
  _finish(){
    this.finish=new THREE.Group();this.finish.position.set(this.course.finishX,this.course.finishY,-.3);this.scene.add(this.finish);
    for(const side of [-1,1]){
      mesh(this.finish,this.cylinder,this.materials.wood,[side*1.9,2.5,0],[.17,5,.17]);
      mesh(this.finish,this.sphere,this.materials.green,[side*1.9,.2,0],[.55,.28,.7]);
      for(let j=0;j<5;j++){const a=j/5*Math.PI*2;const petal=mesh(this.finish,this.sphere,this.materials.pink,[side*1.9+Math.sin(a)*.46,5+Math.cos(a)*.46,0],[.3,.4,.17]);petal.rotation.z=-a;}
      mesh(this.finish,this.sphere,this.materials.gold,[side*1.9,5,.17],[.23,.23,.11]);
    }
    const banner=mesh(this.finish,new THREE.PlaneGeometry(3.8,1.24),label('Blütentor','Geschafft!'),[0,4.22,0]);
    banner.rotation.y=-.12;
    for(let j=0;j<9;j++){
      const pennant=mesh(this.finish,new THREE.ConeGeometry(.18,.43,3),j%2?this.materials.teal:this.materials.pink,[-1.7+j*.425,3.27-Math.sin(j/8*Math.PI)*.3,.12]);pennant.rotation.z=Math.PI;
    }
    // A carpet and two rows of blossoms form a visible finishing lane.
    mesh(this.finish,this.box,this.materials.pink,[0,.035,0],[4.6,.07,3.8]);
  }
  _particles(){
    this.particleStates=Array.from({length:72},()=>({life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0}));
    this.particles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.06,0),new THREE.MeshBasicMaterial({color:0xffde9a}),this.particleStates.length);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particles.frustumCulled=false;this.scene.add(this.particles);
    this.particleDummy=new THREE.Object3D();
    this.petals=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),this.materials.pink,24);
    this.petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.petals.frustumCulled=false;this.scene.add(this.petals);
  }
  _burst(x,y,count=10){
    for(let i=0;i<count;i++){
      const p=this.particleStates[this.particleCursor++%this.particleStates.length],angle=i/count*Math.PI*2;
      Object.assign(p,{life:.65+(i%3)*.1,x,y,z:.2,vx:Math.cos(angle)*2,vy:Math.sin(angle)*2+1.4,vz:(i%3-1)*.7});
    }
  }
  reset(){
    this.rules.reset();this.animationTime=0;this.cameraReady=false;this.finishedBurst=false;
    for(const p of this.particleStates)p.life=0;
    for(const f of this.flowers)f.pulse=0;for(const c of this.critters)c.bonk=0;
    return this.snapshot();
  }
  step(dt,controls={}){
    const events=this.rules.step(dt,controls);
    for(const e of events){
      if(e.type==='bit')this._burst(e.x,e.y,e.kind==='seed'?30:6);
      if(e.type==='spring'){const f=this.flowers.find(f=>f.s.id===e.id);if(f)f.pulse=.7;this._burst(e.x,e.y+.3,14);}
      if(e.type==='checkpoint'){this._burst(e.x,e.y+1.7,16);if(e.kind==='door')this.cameraReady=false;}
      if(e.type==='bump'){const c=this.critters.find(c=>c.c.id===e.id);if(c)c.bonk=.6;this._burst(e.x,e.y+.8,8);}
      if(e.type==='finish'){this._burst(this.rules.x,this.rules.y+2,60);this.finishedBurst=true;}
    }
    return events;
  }
  rescue(){return this.rules.rescue();}
  snapshot(){return {...this.rules.snapshot(),name:this.course.name};}
  layout(){return JSON.parse(JSON.stringify(this.course));}
  seek(progress){const result=this.rules.seek(progress);this.cameraReady=false;return result;}
  render(camera,dt,{reducedMotion=false}={}){
    dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,.1)):0;this.animationTime+=dt;
    const r=this.rules,t=this.animationTime,m=this.hero;
    const recover=r.recovery>0?Math.sin(Math.min(1,r.recovery/.62)*Math.PI)*1.8:0;
    m.group.position.set(r.x,r.y+recover,0);
    const facing=r.facing*(Math.PI/2-.24);
    m.group.rotation.set(0,facing+(reducedMotion?0:r.spin/.36*Math.PI*2),0);
    const moving=Math.min(1,Math.abs(r.vx)/RIBBON.speed),stride=t*14;
    m.legL.rotation.x=r.grounded?Math.sin(stride)*.7*moving:-.46;
    m.legR.rotation.x=r.grounded?-Math.sin(stride)*.7*moving:.36;
    m.armL.rotation.x=r.grounded?-Math.sin(stride)*.48*moving:-.45;
    m.armR.rotation.x=r.grounded?Math.sin(stride)*.48*moving:-.45;
    m.armL.rotation.z=m.armRestZ.L*(r.grounded?.45:1.25);m.armR.rotation.z=m.armRestZ.R*(r.grounded?.45:1.25);
    m.body.position.y=reducedMotion?0:(r.grounded?Math.abs(Math.sin(stride))*.05*moving:0);
    const land=Math.max(0,1-(r.clock-r.lastLanding)/.16);
    m.body.scale.set(1+land*.05,1-land*.07,1+land*.05);m.body.rotation.z=-r.vx*.012;
    m.head.rotation.z=reducedMotion?0:Math.sin(t*2.1)*.025;
    this.recoveryCloud.visible=r.recovery>0;this.recoveryCloud.position.set(r.x,r.y+recover-.08,0);
    let floor=-6;
    for(const p of this.course.platforms){if(!r.platformActive(p))continue;const a=platformAt(p,r.clock);if(r.x>a.x-a.w/2&&r.x<a.x+a.w/2&&a.y<=r.y+.1)floor=Math.max(floor,a.y);}
    this.shadow.visible=floor>-6;this.shadow.position.set(r.x,floor+.045,.07);this.shadow.scale.setScalar(Math.max(.35,1-(r.y-floor)*.075));
    this.shadow.material.opacity=.24*Math.max(.15,1-(r.y-floor)*.11);
    const aspect=Math.max(.35,camera.aspect||1.6),distance=Math.max(23,8/(aspect*Math.tan(43*Math.PI/360)));
    const lead=Math.min(3.6,aspect*3.2),goalX=r.x+r.facing*lead,goalY=Math.max(.6,r.y*.8+1);
    if(!this.cameraReady){this.cameraX=goalX;this.cameraY=goalY;this.cameraReady=true;}
    const ease=1-Math.exp(-dt*7);this.cameraX+=(goalX-this.cameraX)*ease;this.cameraY+=(goalY-this.cameraY)*ease;
    if(camera.isPerspectiveCamera&&camera.fov!==43){camera.fov=43;camera.updateProjectionMatrix();}
    camera.position.set(this.cameraX,this.cameraY+4.3,distance);camera.up.set(0,1,0);camera.lookAt(this.cameraX,this.cameraY+.6,0);
    for(const chunk of this.chunks)chunk.group.visible=Math.abs(chunk.center-r.x)<92;
    for(const {p,group}of this.movers){const a=platformAt(p,r.clock);group.position.set(a.x,a.y,0);group.visible=Math.abs(a.x-r.x)<38&&r.platformActive(p);}
    for(const f of this.flowers){f.pulse=Math.max(0,f.pulse-dt);f.blossom.scale.y=1-Math.sin(f.pulse/.7*Math.PI)*.44;f.group.visible=Math.abs(f.s.x-r.x)<38;}
    for(const {cp,group,flag}of this.flags){
      group.visible=Math.abs(cp.x-r.x)<38;flag.material.color.setHex(cp.index===r.checkpoint?0x61b6ad:0xf3c79c);
      if(!reducedMotion){const pos=flag.geometry.attributes.position;for(let i=0;i<pos.count;i++)pos.setZ(i,Math.sin(t*3+pos.getX(i)*4)*.08*(pos.getX(i)+.45));pos.needsUpdate=true;}
    }
    for(const c of this.critters){const a=critterAt(c.c,r.clock);c.group.position.set(a.x,a.y,0);c.group.visible=Math.abs(a.x-r.x)<38;c.bonk=Math.max(0,c.bonk-dt);
      c.body.rotation.z=reducedMotion?0:Math.sin(t*8+c.c.phase)*.055;c.body.position.y=reducedMotion?0:Math.abs(Math.sin(t*6+c.c.phase))*.06;
      c.body.scale.set(1+c.bonk*.3,1-c.bonk*.25,1+c.bonk*.2);
    }
    this.course.gems.forEach((g,i)=>{
      let gx=g.x,gy=g.y;if(g.platform){const p=this.course.platforms.find(p=>p.id===g.platform),a=platformAt(p,r.clock);gx+=a.x-p.x;gy+=a.y-p.y;}
      const visible=!r.collected.has(g.id)&&Math.abs(gx-r.x)<40;
      this.gemDummy.position.set(gx,gy+(reducedMotion?0:Math.sin(t*2.4+i*.7)*.10),0);
      this.gemDummy.rotation.set(0,reducedMotion?.5:t*1.7+i*.4,.1);this.gemDummy.scale.setScalar(visible?1:0);this.gemDummy.updateMatrix();this.gems.setMatrixAt(i,this.gemDummy.matrix);
    });this.gems.instanceMatrix.needsUpdate=true;
    this.particleStates.forEach((p,i)=>{
      p.life=Math.max(0,p.life-dt);if(p.life>0){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=4*dt;}
      this.particleDummy.position.set(p.x,p.y,p.z);this.particleDummy.scale.setScalar(reducedMotion?0:Math.min(1,p.life*3));this.particleDummy.updateMatrix();this.particles.setMatrixAt(i,this.particleDummy.matrix);
    });this.particles.instanceMatrix.needsUpdate=true;
    this.petals.visible=!reducedMotion;
    if(!reducedMotion)for(let i=0;i<24;i++){
      this.particleDummy.position.set(r.x+((i*7.13+t*.65)%48)-24,2+((i*1.97-t*.18)%11+11)%11,-4-(i%4)*1.8);
      this.particleDummy.rotation.set(t+i,Math.sin(t+i),t*.6+i);this.particleDummy.scale.set(.08,.035,.13);this.particleDummy.updateMatrix();this.petals.setMatrixAt(i,this.particleDummy.matrix);
    }
    this.petals.instanceMatrix.needsUpdate=true;
    this.finish.visible=Math.abs(r.x-this.course.finishX)<44&&r.gateOpen();
    this._renderGarden(dt,{reducedMotion});
  }
}
