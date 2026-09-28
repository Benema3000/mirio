// Mirio's musical cabinet: three physical dioramas, viewed from the flippers.
import * as THREE from 'three';
import {buildMirio} from './mirio-model.js';
import {MARBLE,MARBLE_ROOMS,MARBLE_BELLS,MARBLE_BUMPERS,MARBLE_FLIPPERS,
  MARBLE_WALLS,MARBLE_SLINGS,MARBLE_CLOCK,MARBLE_TOYS,MARBLE_GUIDES,PINBALL_TABLE,
  MarbleRules,bumperBeat,clockAngle,sampleMarblePath} from './marble-rules.js';
import {PINBALL_PALETTES,paint,orb,cylinder,box,beam,batch,buildTableScenery,buildTarget,buildBumper,buildTableBackdrop,buildToyShutter,buildNoteBadge} from './pinball-art.js';
import {PinballEffects} from './pinball-effects.js';

const CREAM=0xfff0cc,INK=0x405267,GOLD=0xf5c454,UP=new THREE.Vector3(0,1,0);
const FIELD=Object.freeze({fov:40,center:22,lean:.65,horizontalFit:.97,verticalFit:.8});
const CABINET_BOUNDS=Object.freeze([
  {x:[-15.1,17.1],y:[-4.8,1],z:[-48.5,3]},
  {x:[-11,11],y:[1,8],z:[-48.5,-44]},
  {x:[-11,11],y:[1,6],z:[-42,-23]},
]);
const DUSK=Object.freeze({radius:300,top:0x3d4a8f,horizon:0xf6b58f,stars:220,starRadius:280});
const RAMP=Object.freeze({samples:72,width:1.15,railRadius:.075,deckHeight:.11});
class ToyCurve extends THREE.Curve {
  #path; #offset;
  constructor(path,offset=0){super();this.#path=path;this.#offset=offset;}
  getPoint(t,target=new THREE.Vector3()){
    const point=sampleMarblePath(this.#path,t);
    if(!this.#offset)return target.set(point.x,point.height+RAMP.deckHeight,-point.y);
    const next=sampleMarblePath(this.#path,Math.min(1,t+.002)),previous=sampleMarblePath(this.#path,Math.max(0,t-.002));
    const dx=next.x-previous.x,dy=next.y-previous.y,length=Math.hypot(dx,dy)||1;
    return target.set(point.x-dy/length*this.#offset,point.height+.35,-point.y-dx/length*this.#offset);
  }
}

export class MarbleRun {
  scene; #rules=new MarbleRules(); #hero; #bubble; #shell; #rim; #roll=new THREE.Group(); #shadow;
  #tables=[]; #bells=[]; #bumpers=[]; #flippers=[]; #toys=[]; #gate; #gateDoor; #plunger; #spring; #charge;
  #pulse; #bird; #progress=[]; #wake=new Map(); #elapsed=0; #clockHand; #effects; #slings=[]; #cradleHalo; #warningColor=new THREE.Color(GOLD);
  #cameraAspect=0; #cameraDistance=0; #cameraDirection=new THREE.Vector3(0,1,FIELD.lean).normalize();

  constructor(art){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(DUSK.horizon);this.#buildSky();
    this.scene.add(new THREE.HemisphereLight(0xfff3db,0x687ca0,1.7));
    const light=new THREE.DirectionalLight(0xffeedb,2);light.position.set(-20,38,12);this.scene.add(light);
    const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    this.#buildCabinet(material);this.#buildTables(material);this.#buildFlippers(material);this.#buildLauncher(material);this.#buildGate(material);
    this.#effects=new PinballEffects(this.scene);
    this.#bubble=new THREE.Group();this.scene.add(this.#bubble);this.#bubble.add(this.#roll);
    this.#shell=new THREE.Mesh(new THREE.SphereGeometry(MARBLE.radius,20,14),new THREE.MeshPhongMaterial({color:0xd9faff,
      transparent:true,opacity:.32,shininess:100,specular:0xffffff,depthWrite:false}));this.#bubble.add(this.#shell);
    this.#rim=new THREE.Mesh(new THREE.TorusGeometry(MARBLE.radius,.045,5,40),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.88,depthWrite:false}));this.#bubble.add(this.#rim);
    for(const angle of [0,Math.PI/2]){
      const stripe=new THREE.Mesh(new THREE.TorusGeometry(MARBLE.radius,.025,5,36),new THREE.MeshBasicMaterial({color:CREAM,transparent:true,opacity:.7}));
      stripe.rotation.y=angle;this.#roll.add(stripe);
    }
    this.#hero=buildMirio(art);this.#hero.group.scale.setScalar(.52);this.#hero.group.position.y=-.61;
    this.#hero.legL.rotation.x=this.#hero.legR.rotation.x=-.45;this.#hero.armL.rotation.x=this.#hero.armR.rotation.x=-.75;this.#bubble.add(this.#hero.group);
    this.#shadow=new THREE.Mesh(new THREE.CircleGeometry(.95,20),new THREE.MeshBasicMaterial({color:0x243546,transparent:true,opacity:.32,depthWrite:false}));
    this.#shadow.rotation.x=-Math.PI/2;this.scene.add(this.#shadow);
    this.#pulse=new THREE.Mesh(new THREE.RingGeometry(.92,1,40),new THREE.MeshBasicMaterial({color:GOLD,side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false}));
    this.#pulse.rotation.x=-Math.PI/2;this.scene.add(this.#pulse);
    this.#cradleHalo=new THREE.Mesh(new THREE.RingGeometry(.9,1.04,32),new THREE.MeshBasicMaterial({color:0xffefbd,transparent:true,opacity:.85,depthWrite:false}));
    this.#cradleHalo.rotation.x=-Math.PI/2;this.scene.add(this.#cradleHalo);this.reset();
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
    const parts=[];
    for(const [a,b]of MARBLE_WALLS){parts.push(beam(...a,...b,.31,0x52677c,.45),beam(...a,...b,.1,CREAM,.76));}
    parts.push(beam(11.8,2,11.8,35,.18,CREAM),beam(14.2,2,14.2,40,.2,GOLD),beam(13,36,10,40,.24,GOLD));
    for(const sling of MARBLE_SLINGS){
      const group=new THREE.Group();group.add(batch([beam(...sling.a,...sling.b,.4,0xeaa080,.55),beam(...sling.a,...sling.b,.1,CREAM,.95)],material));
      this.scene.add(group);this.#slings.push({id:sling.id,group});
    }
    this.scene.add(batch(parts,material));
    // The cushion bird turns a drain into a visible catch and another launch.
    this.#bird=new THREE.Group();this.#bird.position.set(0,.1,-1.1);
    this.#bird.add(batch([orb(0,.35,0,2.7,.38,1.1,0x8cbabe),orb(-1.3,.9,0,.7,.7,.7,0x8cbabe),
      orb(-1.52,1.42,.35,.13,.14,.13,INK),orb(-1.03,1.42,.35,.13,.14,.13,INK),orb(-1.3,1.05,.72,.3,.15,.33,GOLD),
      orb(1,.7,0,1.4,.15,.8,CREAM)],material));this.scene.add(this.#bird);
    for(let i=0;i<9;i++){
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshBasicMaterial({color:0x857978}));
      bulb.position.set(-4+i,.6,1.45);this.scene.add(bulb);this.#progress.push(bulb);
    }
  }

  #buildTables(material){
    for(const [table]of MARBLE_ROOMS.entries()){
      const group=buildTableScenery(table,material),palette=PINBALL_PALETTES[table];group.add(buildTableBackdrop(table));this.scene.add(group);this.#tables.push(group);
      const guideParts=[];
      for(const guide of MARBLE_GUIDES.filter(item=>item.table===table)){
        guideParts.push(beam(...guide.a,...guide.b,guide.radius,palette.accent,.6),beam(...guide.a,...guide.b,.065,CREAM,.88));
      }
      group.add(batch(guideParts,material));
      for(const bell of MARBLE_BELLS.filter(item=>item.table===table)){
        const target=buildTarget(table,bell.radius,material);target.group.position.set(bell.x,0,-bell.y);target.group.add(buildNoteBadge(table));group.add(target.group);
        const lamp=new THREE.Mesh(new THREE.TorusGeometry(bell.radius+.32,.095,6,32),new THREE.MeshBasicMaterial({color:0x87958b}));
        lamp.rotation.x=-Math.PI/2;lamp.position.y=.25;target.group.add(lamp);
        this.#bells.push({spec:bell,...target,lamp});
      }
      for(const bumper of MARBLE_BUMPERS.filter(item=>item.table===table)){
        const toy=new THREE.Group();toy.position.set(bumper.x,0,-bumper.y);group.add(toy);toy.add(buildBumper(table,bumper.radius,material));
        const halo=new THREE.Mesh(new THREE.TorusGeometry(bumper.radius+.13,.09,6,32),new THREE.MeshBasicMaterial({color:CREAM}));
        halo.rotation.x=-Math.PI/2;halo.position.y=.48;toy.add(halo);this.#bumpers.push({spec:bumper,group:toy,halo});
      }
      this.#buildToy(MARBLE_TOYS[table],group,material);
    }
    const face=new THREE.Group();face.position.set(MARBLE_CLOCK.x,.2,-MARBLE_CLOCK.y);
    const marks=[cylinder(0,0,0,3,.1,0xefd3a3)];
    for(let i=0;i<12;i++){const a=i*Math.PI/6;marks.push(orb(Math.cos(a)*2.6,.1,Math.sin(a)*2.6,.1,.045,.1,INK));}
    face.add(batch(marks,material));this.#clockHand=new THREE.Group();
    this.#clockHand.add(batch([beam(-MARBLE_CLOCK.length/2,0,MARBLE_CLOCK.length/2,0,MARBLE_CLOCK.radius,0x53858f,.45),orb(0,.55,0,.4,.3,.4,GOLD)],material));
    face.add(this.#clockHand);this.#tables[PINBALL_TABLE.CLOCK].add(face);
  }

  #buildToy(spec,parent,material){
    const group=new THREE.Group(),palette=PINBALL_PALETTES[spec.table],supports=[];parent.add(group);
    const lampMaterial=new THREE.MeshBasicMaterial({color:palette.light}),lamps=[],routes=[];
    const paths=[spec.path];if(spec.finishPath)paths.push(spec.finishPath);
    for(const [route,path]of paths.entries()){
      const routeGroup=new THREE.Group();group.add(routeGroup);routes.push(routeGroup);
      const left=new ToyCurve(path,-RAMP.width),right=new ToyCurve(path,RAMP.width);
      const rails=[new THREE.TubeGeometry(left,RAMP.samples,RAMP.railRadius,5),new THREE.TubeGeometry(right,RAMP.samples,RAMP.railRadius,5)];
      routeGroup.add(batch(rails.map(geometry=>paint(geometry,palette.rim)),material));
      // Sparse cross-ties leave the floor ball visible under each elevated lane.
      const ties=[];
      for(let i=0;i<=RAMP.samples;i+=3){
        const a=left.getPoint(i/RAMP.samples),b=right.getPoint(i/RAMP.samples);
        const geometry=new THREE.CylinderGeometry(.04,.04,a.distanceTo(b),5);
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,b.clone().sub(a).normalize()));
        ties.push(paint(geometry.translate((a.x+b.x)/2,a.y-.21,(a.z+b.z)/2),palette.accent));
      }
      routeGroup.add(batch(ties,material));
      for(let i=0;i<=RAMP.samples;i+=8){
        const p=left.getPoint(i/RAMP.samples);if(p.y<1)continue;
        if(route===0)supports.push(cylinder(p.x,(p.y-.2)/2,p.z,.09,p.y-.2,palette.body));
        const lamp=new THREE.Mesh(new THREE.SphereGeometry(.14,7,5),lampMaterial);lamp.position.copy(p);routeGroup.add(lamp);lamps.push({mesh:lamp,progress:i/RAMP.samples,route});
      }
      // A tinted, narrow deck describes the track without making a solid canopy.
      const vertices=[],indices=[];
      for(let i=0;i<=RAMP.samples;i++){
        for(const edge of [left,right]){const p=edge.getPoint(i/RAMP.samples);vertices.push(p.x,p.y-.27,p.z);}
        if(i<RAMP.samples){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      routeGroup.add(new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:palette.light,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false})));
    }
    const stilts=new THREE.Group();group.add(stilts);
    if(supports.length)stilts.add(batch(supports,material));
    const mouth=new THREE.Mesh(new THREE.TorusGeometry(spec.mouth.radius,.14,6,40),new THREE.MeshBasicMaterial({color:palette.light}));
    mouth.rotation.x=-Math.PI/2;mouth.position.set(spec.mouth.x,.25,-spec.mouth.y);group.add(mouth);
    const toy=new THREE.Group();toy.position.set(spec.mouth.x,0,-spec.mouth.y);group.add(toy);
    const parts=[];
    if(spec.table===PINBALL_TABLE.GARDEN){
      for(const side of [-1,1]){
        parts.push(cylinder(side*2.25,.9,0,.2,1.5,0x629671),orb(side*2.25,1.7,0,.72,.3,.72,0xe7a2aa),orb(side*2.25,2,0,.22,.18,.22,GOLD));
        parts.push(orb(side*1.7,.3,1.4,.8,.12,.5,0x77a773));
      }
    }
    if(spec.table===PINBALL_TABLE.CLOCK){
      parts.push(box(-2.3,1.4,-1,.5,2.8,1.2,0xc99764),box(2.3,1.4,-1,.5,2.8,1.2,0xc99764),box(0,2.7,-1,5,.35,1.2,0xe9bd7d),
        orb(0,3.45,-1.2,.85,.65,.6,0x8db8b8),orb(-.29,3.6,-.62,.1,.11,.05,INK),orb(.29,3.6,-.62,.1,.11,.05,INK),orb(0,3.28,-.53,.25,.13,.3,GOLD));
    }
    if(spec.table===PINBALL_TABLE.MOON){
      for(const side of [-1,1])parts.push(orb(side*2.4,.5,0,.48,.48,.48,palette.accent),cylinder(side*2.4,.8,0,.09,1.1,palette.rim));
    }
    if(parts.length)toy.add(batch(parts,material));
    const shutter=buildToyShutter(spec);if(shutter)group.add(shutter);
    this.#toys.push({spec,group,mouth,lamps,routes,stilts,lampMaterial,toy,shutter,growth:0});
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
    const springs=[];this.#spring=new THREE.Group();this.scene.add(this.#spring);
    for(let y=0;y<2;y+=.3)springs.push(paint(new THREE.TorusGeometry(.45,.065,5,18).rotateX(Math.PI/2).translate(13,.25,-y),INK));
    this.#spring.add(batch(springs,material));
    this.#charge=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,3),new THREE.MeshBasicMaterial({color:GOLD}));
    this.#charge.position.set(14.5,.2,-3);this.scene.add(this.#charge);
  }

  #buildGate(material){
    this.#gate=new THREE.Group();this.#gate.position.set(0,0,-41);this.scene.add(this.#gate);
    this.#gate.add(batch([cylinder(-2.8,1.5,0,.2,3,CREAM),cylinder(2.8,1.5,0,.2,3,CREAM),
      paint(new THREE.TorusGeometry(2.8,.2,8,36,Math.PI).translate(0,3,0),GOLD),cylinder(0,.18,0,2.6,.28,CREAM),
      orb(0,4.1,0,.8,.75,.8,GOLD),orb(0,3.6,0,.95,.15,.95,GOLD)],material));
    this.#gateDoor=new THREE.Mesh(new THREE.BoxGeometry(4.8,.8,.25),new THREE.MeshLambertMaterial({color:0xa08c82}));
    this.#gateDoor.position.set(0,.55,.4);this.#gate.add(this.#gateDoor);
  }

  reset(){
    this.#elapsed=0;this.#wake.clear();this.#effects?.reset();this.#roll.rotation.set(0,0,0);
    for(const toy of this.#toys)toy.growth=0;
    return this.#rules.reset();
  }
  step(dt,input){
    const events=this.#rules.step(dt,input);
    for(const event of events){
      if(['marble-bumper','note','flipper-hit','pinball-toy','pinball-wall'].includes(event.type)){
        this.#wake.set(event.id??event.side,.6);this.#effects.hit(event);
      }
    }
    return events;
  }
  rescue(){return this.#rules.rescue();}
  seek(progress){this.#effects.reset();return this.#rules.seek(progress);}
  snapshot(){return {...this.#rules.snapshot(),name:'Klangkugel'};}
  layout(){return this.#rules.layout();}

  render(camera,dt=0,{reducedMotion=false}={}){
    dt=Math.max(0,Math.min(dt,.1));this.#elapsed+=dt;const r=this.#rules.snapshot(),t=this.#elapsed;
    for(const [id,wake]of this.#wake)this.#wake.set(id,Math.max(0,wake-dt));
    const hop=reducedMotion?0:r.recovering>0?Math.sin(r.recovering/MARBLE.recoveryTime*Math.PI)*1.2:0;
    const lift=r.phase==='lift'?(1-r.transition/MARBLE.transitionTime)*3:0;
    this.#bubble.position.set(r.x,MARBLE.radius+r.height+hop+lift,-r.y);
    this.#shadow.position.set(r.x,.21,-r.y);this.#shadow.visible=r.phase!=='lift';this.#shadow.scale.setScalar(1+r.height*.14);this.#shadow.material.opacity=.32/(1+r.height*.2);
    if(!reducedMotion){this.#roll.rotation.x-=r.vy*dt/MARBLE.radius;this.#roll.rotation.z-=r.vx*dt/MARBLE.radius;}
    this.#hero.group.rotation.y=r.speed>1?Math.atan2(r.vx,-r.vy):0;
    this.#hero.body.rotation.z=reducedMotion?0:-r.vx*.015;this.#hero.body.rotation.x=reducedMotion?0:-r.vy*.015;
    this.#shell.material.opacity=r.served?.4:.3;
    this.#pulse.visible=r.pulse>0;this.#pulse.position.set(r.x,.24,-r.y);this.#pulse.scale.setScalar(reducedMotion?2:1+(1-r.pulse/MARBLE.pulseTime)*4);this.#pulse.material.opacity=r.pulse;
    for(const [i,table]of this.#tables.entries())table.visible=i===r.table;
    for(const item of this.#bells){
      const lit=r.noteIds.includes(item.spec.id),wake=this.#wake.get(item.spec.id)||0;item.flourish.visible=lit;
      item.lamp.material.color.setHex(lit?PINBALL_PALETTES[item.spec.table].light:0x87958b);
      item.body.scale.y=item.spec.table===PINBALL_TABLE.CLOCK&&lit?.25:1;
      if(!reducedMotion&&wake>0)item.body.scale.y*=1+Math.sin(wake*15)*.15;
      item.flourish.rotation.y=reducedMotion?0:t*.35;
    }
    for(const item of this.#bumpers){
      const wake=this.#wake.get(item.spec.id)||0,beat=bumperBeat(r.time,item.spec);
      item.group.scale.y=reducedMotion?1:1+beat.anticipation*.12+(wake>0?Math.sin(wake*15)*.18:0);
      item.halo.material.color.setHex(wake>0||beat.active?PINBALL_PALETTES[item.spec.table].accent:CREAM);
    }
    for(const item of this.#slings)item.group.scale.y=reducedMotion?1:1+(this.#wake.get(item.id)||0)*.3;
    for(const item of this.#flippers){const angle=r.flipperAngles[item.spec.id];item.group.rotation.y=item.spec.side===1?angle:Math.PI-angle;}
    this.#clockHand.rotation.y=clockAngle(r.time);
    for(const item of this.#toys){
      if(item.spec.table!==r.table)continue;
      const toy=r.toy,active=toy?.active,ready=toy?.ready,open=toy?.open;
      const finishRoute=active?toy.route==='finish':r.tableNotes>=2;
      const garden=item.spec.table===PINBALL_TABLE.GARDEN,grown=!garden||ready||active||toy.completions>0;
      item.growth=reducedMotion?(grown?1:0):Math.min(1,item.growth+(grown?dt*1.6:-dt*2));
      item.growth=Math.max(0,item.growth);item.stilts.visible=item.growth>0;item.stilts.scale.y=Math.max(.01,item.growth);
      for(const [index,route]of item.routes.entries()){route.visible=index===(finishRoute?1:0)&&item.growth>0;route.scale.y=Math.max(.01,item.growth);}
      item.mouth.material.color.setHex(open?PINBALL_PALETTES[r.table].light:0x77848c);
      if(item.spec.table===PINBALL_TABLE.CLOCK&&!open){
        item.mouth.material.color.lerp(this.#warningColor,toy.anticipation);
        item.shutter.material.emissive.copy(this.#warningColor);item.shutter.material.emissiveIntensity=toy.anticipation*.35;
      }
      item.mouth.scale.setScalar(reducedMotion||!open?1:1+Math.sin(t*3)*.045);
      item.lampMaterial.color.setHex(active?GOLD:ready?PINBALL_PALETTES[r.table].light:0x657782);
      if(item.shutter)item.shutter.visible=!open&&!active;
      for(const lamp of item.lamps){
        const chasing=active&&Math.abs(lamp.progress-toy.progress)<.2;
        lamp.mesh.scale.setScalar(reducedMotion?1:chasing?1.6:1);
      }
      item.toy.scale.y=reducedMotion?1:active?1+Math.sin(t*8)*.05:1;
    }
    this.#gateDoor.position.y=r.finishReady?3.5:.55;this.#gateDoor.material.color.setHex(r.finishReady?GOLD:0xa08c82);
    this.#bird.scale.y=reducedMotion?1:r.recovering>0?1.2+Math.sin(t*9)*.15:1;
    this.#plunger.position.z=-2+r.plungerCharge*.9;this.#spring.scale.z=1-r.plungerCharge*.45;
    this.#charge.scale.z=.06+r.plungerCharge;this.#charge.visible=r.served;
    for(const [i,bulb]of this.#progress.entries())bulb.material.color.setHex(i<r.notes?GOLD:0x857978);
    this.#cradleHalo.visible=Boolean(r.cradled);this.#cradleHalo.position.set(r.x,.24,-r.y);
    this.#effects.render(dt,r,{reducedMotion});this.#frameCamera(camera);this.#rim.quaternion.copy(camera.quaternion);
  }

  #frameCamera(camera){
    // Fit the complete cabinet at a fixed tilt; impacts never move the camera.
    if(this.#cameraAspect!==camera.aspect){
      this.#cameraAspect=camera.aspect;const tangent=Math.tan(FIELD.fov*Math.PI/360),direction=this.#cameraDirection;
      const vertical=new THREE.Vector3(0,direction.z,-direction.y);let distance=0;
      for(const bounds of CABINET_BOUNDS)for(const x of bounds.x)for(const y of bounds.y)for(const z of bounds.z){
        const point=new THREE.Vector3(x-1,y,z+FIELD.center),depth=point.dot(direction);
        distance=Math.max(distance,Math.abs(point.x)/(tangent*FIELD.horizontalFit*camera.aspect)+depth,Math.abs(point.dot(vertical))/(tangent*FIELD.verticalFit)+depth);
      }
      this.#cameraDistance=distance;
    }
    if(camera.fov!==FIELD.fov){camera.fov=FIELD.fov;camera.updateProjectionMatrix();}
    camera.position.copy(this.#cameraDirection).multiplyScalar(this.#cameraDistance).add(new THREE.Vector3(1,0,-FIELD.center));
    camera.up.copy(UP);camera.lookAt(1,0,-FIELD.center);
  }
}
