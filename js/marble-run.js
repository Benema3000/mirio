// Mirio rides a pinball through three rooms of a musical toy cabinet.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildMirio} from './mirio-model.js';
import {MARBLE,MARBLE_ROOMS,MARBLE_BELLS,MARBLE_BUMPERS,MARBLE_FLIPPERS,
  MARBLE_WALLS,MARBLE_SLINGS,MARBLE_CLOCK,PINBALL_TABLE,MarbleRules,bumperBeat,clockAngle} from './marble-rules.js';

const CREAM=0xfff0cc,INK=0x405267,GOLD=0xf5c454,UP=new THREE.Vector3(0,1,0);
const FIELD=Object.freeze({width:30,length:46,center:22,near:64,fov:44});
const DUSK=Object.freeze({radius:300,top:0x3d4a8f,horizon:0xf6b58f,stars:220,starRadius:280});
const paint=(geometry,color)=>{
  const value=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3)value.toArray(colors,i);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');return geometry;
};
const orb=(x,y,z,sx,sy,sz,color)=>paint(new THREE.SphereGeometry(1,12,8).scale(sx,sy,sz).translate(x,y,z),color);
const cylinder=(x,y,z,r,h,color)=>paint(new THREE.CylinderGeometry(r,r,h,24).translate(x,y,z),color);
const box=(x,y,z,w,h,d,color)=>paint(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color);
function beam(ax,ay,bx,by,r,color,height=.6){
  const dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);
  const geometry=new THREE.CylinderGeometry(r,r,length,10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,new THREE.Vector3(dx,0,-dy).normalize()));
  return paint(geometry.translate((ax+bx)/2,height,-(ay+by)/2),color);
}
function batch(parts,material){
  const flat=parts.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(flat);
  for(const g of new Set([...parts,...flat]))g.dispose();return new THREE.Mesh(geometry,material);
}
function glyph(text,width=4,color='#405267',background='#fff0cc'){
  const compact=text.length<=3,canvas=document.createElement('canvas');canvas.width=compact?256:512;canvas.height=compact?256:160;
  const ctx=canvas.getContext('2d');
  if(background){ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(4,4,canvas.width-8,canvas.height-8,30);ctx.fill();}
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  const fontSize=compact?(text.length===1?180:120):70;ctx.font=`bold ${fontSize}px sans-serif`;
  const fit=Math.min(1,(canvas.width-30)/ctx.measureText(text).width);ctx.font=`bold ${Math.floor(fontSize*fit)}px sans-serif`;
  ctx.fillText(text,canvas.width/2,canvas.height/2+3);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false}));sprite.scale.set(width,width*canvas.height/canvas.width,1);return sprite;
}
function floorGlyph(text,x,y,width,color){
  const sprite=glyph(text,width,color);sprite.position.set(x,.5,-y);return sprite;
}

export class MarbleRun {
  scene; #rules=new MarbleRules(); #hero; #bubble; #shell; #rim; #roll=new THREE.Group(); #shadow;
  #tables=[]; #bells=[]; #bumpers=[]; #flippers=[]; #gate; #gateDoor; #plunger; #spring; #charge;
  #pulse; #bird; #progress=[]; #wake=new Map(); #elapsed=0; #clockHand; #clockFace;

  constructor(art){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(DUSK.horizon);
    this.#buildSky();
    this.scene.add(new THREE.HemisphereLight(0xfff3db,0x7892a8,2));
    const light=new THREE.DirectionalLight(0xfff0d6,2.4);light.position.set(-15,38,20);this.scene.add(light);
    const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    this.#buildCabinet(material);this.#buildTables(material);this.#buildFlippers(material);this.#buildLauncher(material);this.#buildGate(material);
    this.#bubble=new THREE.Group();this.scene.add(this.#bubble);this.#bubble.add(this.#roll);
    this.#shell=new THREE.Mesh(new THREE.SphereGeometry(MARBLE.radius,20,14),new THREE.MeshPhongMaterial({color:0xc9eff5,
      transparent:true,opacity:.26,shininess:100,specular:0xffffff,depthWrite:false}));this.#bubble.add(this.#shell);
    this.#rim=new THREE.Mesh(new THREE.TorusGeometry(MARBLE.radius,.04,5,40),new THREE.MeshBasicMaterial({color:0x54889c,transparent:true,opacity:.8,depthWrite:false}));this.#bubble.add(this.#rim);
    for(const angle of [0,Math.PI/2]){
      const stripe=new THREE.Mesh(new THREE.TorusGeometry(MARBLE.radius,.025,5,36),new THREE.MeshBasicMaterial({color:CREAM,transparent:true,opacity:.75}));
      stripe.rotation.y=angle;this.#roll.add(stripe);
    }
    this.#hero=buildMirio(art);this.#hero.group.scale.setScalar(.52);this.#hero.group.position.y=-.61;
    this.#hero.legL.rotation.x=this.#hero.legR.rotation.x=-.45;this.#hero.armL.rotation.x=this.#hero.armR.rotation.x=-.75;
    this.#bubble.add(this.#hero.group);
    this.#shadow=new THREE.Mesh(new THREE.CircleGeometry(.95,20),new THREE.MeshBasicMaterial({color:0x485b72,transparent:true,opacity:.2,depthWrite:false}));
    this.#shadow.rotation.x=-Math.PI/2;this.scene.add(this.#shadow);
    this.#pulse=new THREE.Mesh(new THREE.RingGeometry(.92,1,40),new THREE.MeshBasicMaterial({color:GOLD,side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false}));
    this.#pulse.rotation.x=-Math.PI/2;this.scene.add(this.#pulse);this.reset();
  }

  #buildSky(){
    // Keep the parent's dusk setting; the fixed table camera needs no distance fog.
    const dome=new THREE.SphereGeometry(DUSK.radius,32,16),colors=[];
    const top=new THREE.Color(DUSK.top),low=new THREE.Color(DUSK.horizon),color=new THREE.Color();
    for(let i=0;i<dome.attributes.position.count;i++){
      const y=dome.attributes.position.getY(i)/DUSK.radius;
      color.copy(low).lerp(top,Math.pow(Math.max(0,y),.6));colors.push(color.r,color.g,color.b);
    }
    dome.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.scene.add(new THREE.Mesh(dome,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false})));

    const stars=[];
    for(let i=0;i<DUSK.stars;i++){
      const angle=i*2.399,y=.35+((i*.618)%1)*.6,radius=Math.sqrt(1-y*y)*DUSK.starRadius;
      stars.push(Math.cos(angle)*radius,y*DUSK.starRadius,Math.sin(angle)*radius);
    }
    this.scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(stars,3)),
      new THREE.PointsMaterial({color:0xfff6dc,size:1.4,fog:false})));
  }

  #buildCabinet(material){
    const parts=[box(1,-1,-22,FIELD.width,1.8,FIELD.length,0xb38a69),box(1,-.05,-22,29,.18,45,CREAM),
      box(-13,.35,-22,.7,1,45,0x806c67),box(15,.35,-22,.7,1,45,0x806c67),box(1,.35,-44,28,1,.7,0x806c67)];
    for(const [a,b]of MARBLE_WALLS)parts.push(beam(...a,...b,.25,GOLD,.45));
    parts.push(beam(11.8,2,11.8,35,.18,CREAM),beam(14.2,2,14.2,40,.2,GOLD),beam(13,36,10,40,.24,GOLD));
    for(const sling of MARBLE_SLINGS)parts.push(beam(...sling.a,...sling.b,.42,0xde948d,.55));
    // Broad arrow lanes show the return to the bats and the launcher's exit.
    for(const side of [-1,1])for(const y of [13,17]){
      parts.push(beam(side*9,y,side*8.4,y-1,.09,CREAM,.13),beam(side*7.8,y,side*8.4,y-1,.09,CREAM,.13));
    }
    for(let y=7;y<=33;y+=4)parts.push(beam(12.7,y,13,y+1,.07,0x82725f,.2),beam(13.3,y,13,y+1,.07,0x82725f,.2));
    this.scene.add(batch(parts,material));
    for(const [text,x,y,width]of [['←',-6.5,3.3,3],['→',6.5,3.3,3],['↓ ↑',13,1,3],['♪  ♪  ♪  →  ↑',0,17,7]])this.scene.add(floorGlyph(text,x,y,width));
    // A cuckoo's cushion turns every drain into a quick return to the launcher.
    this.#bird=new THREE.Group();this.#bird.position.set(0,.1,-1.5);
    this.#bird.add(batch([orb(0,.35,0,2.7,.38,1.1,0x8cbabe),orb(-1.3,.9,0,.7,.7,.7,0x8cbabe),
      orb(-1.52,1.42,.35,.13,.14,.13,INK),orb(-1.03,1.42,.35,.13,.14,.13,INK),orb(-1.3,1.05,.72,.3,.15,.33,GOLD),
      orb(1,.7,0,1.4,.15,.8,CREAM)],material));this.scene.add(this.#bird);
    for(let i=0;i<9;i++){
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.27,10,8),new THREE.MeshBasicMaterial({color:0x857978}));
      bulb.position.set(-4+i,1,-44);this.scene.add(bulb);this.#progress.push(bulb);
    }
  }

  #buildTables(material){
    for(const [table,room]of MARBLE_ROOMS.entries()){
      const group=new THREE.Group();this.scene.add(group);this.#tables.push(group);
      const parts=[box(0,.06,-23,22,.08,37,room.color)];
      // Inlaid flowers, clock spokes and lunar craters distinguish the three rooms.
      for(const side of [-1,1])for(let i=0;i<5;i++){
        const x=side*(8.6-i*.16),y=10+i*5.7;
        parts.push(orb(x,.13,-y,.65,.025,.65,CREAM));
        if(table===PINBALL_TABLE.GARDEN)for(let p=0;p<5;p++)parts.push(orb(x+Math.sin(p*1.256)*.85,.13,-y+Math.cos(p*1.256)*.85,.47,.025,.47,room.ink));
        if(table===PINBALL_TABLE.CLOCK)parts.push(beam(x-.8,y-.8,x+.8,y+.8,.09,room.ink,.16),beam(x+.8,y-.8,x-.8,y+.8,.09,room.ink,.16));
        if(table===PINBALL_TABLE.MOON)parts.push(orb(x+.25,.145,-y,.55,.025,.55,room.color));
      }
      group.add(batch(parts,material));
      const title=glyph(`${table+1} · ${room.name}`,8);title.position.set(0,.25,-12.5);group.add(title);
      for(const bell of MARBLE_BELLS.filter(b=>b.table===table)){
        const target=new THREE.Group();target.position.set(bell.x,0,-bell.y);group.add(target);
        target.add(batch([cylinder(0,.35,0,bell.radius,.5,CREAM),orb(0,.7,0,bell.radius,.55,bell.radius,room.ink)],material));
        const face=glyph(bell.note,3.2,'#fff5d0',null);face.position.y=2;target.add(face);
        const lamp=new THREE.Mesh(new THREE.TorusGeometry(1.65,.14,6,32),new THREE.MeshBasicMaterial({color:CREAM}));
        lamp.rotation.x=-Math.PI/2;lamp.position.y=.2;target.add(lamp);
        const petals=new THREE.Group();target.add(petals);
        for(let p=0;p<6;p++){
          const a=p*Math.PI/3,petal=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),new THREE.MeshLambertMaterial({color:GOLD}));
          petal.scale.set(.75,.18,.38);petal.position.set(Math.cos(a)*1.9,.27,Math.sin(a)*1.9);petal.rotation.y=-a;petals.add(petal);
        }
        this.#bells.push({spec:bell,group:target,lamp,face,petals});
      }
      for(const bumper of MARBLE_BUMPERS.filter(b=>b.table===table)){
        const toy=new THREE.Group();toy.position.set(bumper.x,0,-bumper.y);group.add(toy);
        toy.add(batch([cylinder(0,.3,0,bumper.radius,.5,CREAM),orb(0,.8,0,bumper.radius,.68,bumper.radius,room.ink),
          orb(-.35,1.4,.36,.13,.065,.16,INK),orb(.35,1.4,.36,.13,.065,.16,INK)],material));
        const halo=new THREE.Mesh(new THREE.TorusGeometry(bumper.radius+.13,.11,6,32),new THREE.MeshBasicMaterial({color:CREAM}));
        halo.rotation.x=-Math.PI/2;halo.position.y=.8;toy.add(halo);this.#bumpers.push({spec:bumper,group:toy,halo});
      }
    }
    this.#clockFace=new THREE.Group();this.#clockFace.position.set(MARBLE_CLOCK.x,.18,-MARBLE_CLOCK.y);
    this.#clockFace.add(batch([cylinder(0,0,0,3,.08,CREAM)],material));
    this.#clockHand=new THREE.Group();this.#clockHand.add(batch([beam(-MARBLE_CLOCK.length/2,0,MARBLE_CLOCK.length/2,0,MARBLE_CLOCK.radius,0x6c91a6,.45),orb(0,.55,0,.4,.3,.4,GOLD)],material));
    this.#clockFace.add(this.#clockHand);this.#tables[PINBALL_TABLE.CLOCK].add(this.#clockFace);
  }

  #buildFlippers(material){
    for(const spec of MARBLE_FLIPPERS){
      const group=new THREE.Group();group.position.set(spec.x,.65,-spec.y);this.scene.add(group);
      group.add(batch([beam(0,0,MARBLE.flipperLength,0,MARBLE.flipperRadius,CREAM,0),
        orb(0,0,0,.65,.35,.65,GOLD),orb(MARBLE.flipperLength,0,0,MARBLE.flipperRadius,.3,MARBLE.flipperRadius,0xd77770),
        beam(.7,0,MARBLE.flipperLength-.4,0,.13,0xd77770,.34)],material));
      this.#flippers.push({spec,group});
    }
  }

  #buildLauncher(material){
    this.#plunger=new THREE.Group();this.#plunger.position.set(13,0,-2);this.scene.add(this.#plunger);
    this.#plunger.add(batch([cylinder(0,.5,0,.78,.35,GOLD),orb(0,.82,0,.63,.24,.63,CREAM)],material));
    this.#spring=new THREE.Group();this.scene.add(this.#spring);
    for(let y=0;y<2;y+=.3){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.45,.065,5,18),new THREE.MeshLambertMaterial({color:INK}));
      ring.rotation.x=Math.PI/2;ring.position.set(13,.25,-y);this.#spring.add(ring);
    }
    this.#charge=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,3),new THREE.MeshBasicMaterial({color:GOLD}));
    this.#charge.position.set(14.5,.2,-3);this.scene.add(this.#charge);
  }

  #buildGate(material){
    this.#gate=new THREE.Group();this.#gate.position.set(0,0,-41);this.scene.add(this.#gate);
    this.#gate.add(batch([cylinder(-2.8,1.5,0,.25,3,CREAM),cylinder(2.8,1.5,0,.25,3,CREAM),
      paint(new THREE.TorusGeometry(2.8,.25,8,36,Math.PI).translate(0,3,0),GOLD),
      cylinder(0,.18,0,2.6,.28,CREAM)],material));
    this.#gateDoor=new THREE.Mesh(new THREE.BoxGeometry(4.8,.8,.38),new THREE.MeshLambertMaterial({color:0xa08c82}));
    this.#gateDoor.position.set(0,.55,.4);this.#gate.add(this.#gateDoor);
    const bell=glyph('♬ ↑',5);bell.position.set(0,4.5,0);this.#gate.add(bell);
  }

  reset(){this.#elapsed=0;this.#wake.clear();this.#roll.rotation.set(0,0,0);return this.#rules.reset();}
  step(dt,input){
    const events=this.#rules.step(dt,input);
    for(const event of events)if(event.type==='marble-bumper'||event.type==='note')this.#wake.set(event.id,.6);
    return events;
  }
  rescue(){return this.#rules.rescue();}
  seek(progress){return this.#rules.seek(progress);}
  snapshot(){return {...this.#rules.snapshot(),name:'Klangkugel'};}
  layout(){return this.#rules.layout();}

  render(camera,dt=0,{reducedMotion=false}={}){
    dt=Math.max(0,Math.min(dt,.1));this.#elapsed+=dt;const r=this.#rules.snapshot(),t=this.#elapsed;
    const hop=reducedMotion?0:r.recovering>0?Math.sin(r.recovering/MARBLE.recoveryTime*Math.PI)*1.2:0;
    const lift=r.phase==='lift'?(1-r.transition/MARBLE.transitionTime)*3:0;
    this.#bubble.position.set(r.x,MARBLE.radius+hop+lift,-r.y);
    this.#shadow.position.set(r.x,.2,-r.y);this.#shadow.visible=r.phase!=='lift';
    if(!reducedMotion){this.#roll.rotation.x-=r.vy*dt/MARBLE.radius;this.#roll.rotation.z-=r.vx*dt/MARBLE.radius;}
    this.#hero.group.rotation.y=r.speed>1?Math.atan2(r.vx,-r.vy):0;
    this.#hero.body.rotation.z=reducedMotion?0:-r.vx*.015;this.#hero.body.rotation.x=reducedMotion?0:-r.vy*.015;
    this.#shell.material.opacity=r.served?.35:.26;
    this.#pulse.visible=r.pulse>0;this.#pulse.position.set(r.x,.2,-r.y);this.#pulse.scale.setScalar(1+(1-r.pulse/MARBLE.pulseTime)*4);
    this.#pulse.material.opacity=r.pulse;
    for(const [i,table]of this.#tables.entries())table.visible=i===r.table;
    for(const item of this.#bells){
      const lit=r.noteIds.includes(item.spec.id);item.petals.visible=lit;item.lamp.material.color.setHex(lit?GOLD:CREAM);
      item.face.position.y=lit&&!reducedMotion?2.1+Math.sin(t*3+item.spec.x)*.15:2;
    }
    for(const item of this.#bumpers){
      const wake=Math.max(0,(this.#wake.get(item.spec.id)||0)-dt);this.#wake.set(item.spec.id,wake);
      const beat=bumperBeat(r.time,item.spec);item.group.scale.y=reducedMotion?1:1+beat.anticipation*.15+(wake>0?Math.sin(wake*15)*.17:0);
      item.halo.material.color.setHex(wake>0||beat.active?GOLD:CREAM);
    }
    for(const item of this.#flippers){
      const angle=r.flipperAngles[item.spec.id];item.group.rotation.y=item.spec.side===1?angle:Math.PI-angle;
    }
    this.#clockHand.rotation.y=clockAngle(r.time);
    this.#gateDoor.position.y=r.finishReady?3.5:.55;this.#gateDoor.material.color.setHex(r.finishReady?GOLD:0xa08c82);
    this.#bird.scale.y=reducedMotion?1:r.recovering>0?1.2+Math.sin(t*9)*.15:1;
    this.#plunger.position.z=-2+r.plungerCharge*.9;this.#spring.scale.z=1-r.plungerCharge*.45;
    this.#charge.scale.z=.06+r.plungerCharge;this.#charge.visible=r.served;
    for(const [i,bulb]of this.#progress.entries())bulb.material.color.setHex(i<r.notes?GOLD:0x857978);
    const height=Math.max(FIELD.near,34/camera.aspect/(2*Math.tan(FIELD.fov*Math.PI/360)));
    if(camera.fov!==FIELD.fov){camera.fov=FIELD.fov;camera.updateProjectionMatrix();}
    // The entire table stays visible; a hit never shakes or chases the ball.
    camera.position.set(1,height,-FIELD.center+height*.3);camera.up.copy(UP);camera.lookAt(1,0,-FIELD.center);
    this.#rim.quaternion.copy(camera.quaternion);
  }
}
