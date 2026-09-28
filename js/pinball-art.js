// Code-painted playfields and batched toy scenery keep the cabinet light on phones.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PINBALL_TABLE,MARBLE_CLOCK_GATE} from './marble-rules.js';

export const PINBALL_PALETTES=Object.freeze([
  {body:0x30796f,rim:0xffd89b,field:'#f3e4ba',dark:'#527c65',wash:'#dee9c3',accent:0xf18591,light:0xffecc0,back:0x86b8b1},
  {body:0x384f75,rim:0xeec58c,field:'#4b6886',dark:'#b1ced3',wash:'#314b6a',accent:0xffb85b,light:0xc2fff1,back:0x8292b4},
  {body:0x423667,rim:0x9fa7fa,field:'#222b5c',dark:'#869be3',wash:'#353f77',accent:0xffd66e,light:0xc0e6ff,back:0x6c78a1},
]);
const UP=new THREE.Vector3(0,1,0),INK=0x344957,CREAM=0xfff2d3;
const SURFACE=Object.freeze({width:30,length:46,centerX:1,centerY:22,textureWidth:1024,textureHeight:1536});
export function paint(geometry,color){
  const value=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3)value.toArray(colors,i);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');return geometry;
}
export const orb=(x,y,z,sx,sy,sz,color)=>paint(new THREE.SphereGeometry(1,12,8).scale(sx,sy,sz).translate(x,y,z),color);
export const cylinder=(x,y,z,r,h,color)=>paint(new THREE.CylinderGeometry(r,r,h,20).translate(x,y,z),color);
export const box=(x,y,z,w,h,d,color)=>paint(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color);
export function beam(ax,ay,bx,by,r,color,height=.6){
  const dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);
  const geometry=new THREE.CylinderGeometry(r,r,length,10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,new THREE.Vector3(dx,0,-dy).normalize()));
  return paint(geometry.translate((ax+bx)/2,height,-(ay+by)/2),color);
}
export function pipe(points,radius,color){
  const curve=new THREE.CatmullRomCurve3(points.map(([x,y,z])=>new THREE.Vector3(x,y,z)));
  return paint(new THREE.TubeGeometry(curve,Math.max(12,points.length*6),radius,6,false),color);
}
export function batch(parts,material){
  const flat=parts.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(flat);
  for(const g of new Set([...parts,...flat]))g.dispose();return new THREE.Mesh(geometry,material);
}
function ring(x,y,z,r,width,color){return paint(new THREE.TorusGeometry(r,width,6,32).rotateX(Math.PI/2).translate(x,y,z),color);}
function flower(parts,x,y,z,r,color){
  for(let p=0;p<6;p++){const a=p*Math.PI/3;parts.push(orb(x+Math.cos(a)*r*.7,y,z+Math.sin(a)*r*.7,r*.48,r*.24,r*.48,color));}
  parts.push(orb(x,y+r*.15,z,r*.36,r*.28,r*.36,0xffd667));
}
function eyes(parts,x,y,z,size=.16){parts.push(orb(x-.4,y,z,size,size*1.15,size*.6,INK),orb(x+.4,y,z,size,size*1.15,size*.6,INK));}
function gear(parts,x,y,z,r,color){
  parts.push(cylinder(x,y,z,r,.3,color),ring(x,y+.17,z,r*.55,.12,CREAM));
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,geometry=new THREE.BoxGeometry(.5,.35,.65).rotateY(-angle).translate(x+Math.cos(angle)*r,y,z+Math.sin(angle)*r);
    parts.push(paint(geometry,color));
  }
  parts.push(cylinder(x,y+.23,z,.22,.3,INK));
}
function starShape(ctx,x,y,r,color){
  ctx.fillStyle=color;ctx.beginPath();
  for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,s=i%2?r*.42:r;ctx.lineTo(x+Math.cos(a)*s,y+Math.sin(a)*s);}
  ctx.closePath();ctx.fill();
}

function surface(table,palette){
  const canvas=document.createElement('canvas');canvas.width=SURFACE.textureWidth;canvas.height=SURFACE.textureHeight;
  const ctx=canvas.getContext('2d'),sx=canvas.width/SURFACE.width,sy=canvas.height/SURFACE.length;
  ctx.scale(sx,sy);ctx.translate(14,45);
  ctx.fillStyle=palette.field;ctx.fillRect(-14,-45,30,46);
  const gradient=ctx.createLinearGradient(0,-45,0,1);gradient.addColorStop(0,palette.wash);gradient.addColorStop(1,palette.field);
  ctx.fillStyle=gradient;ctx.fillRect(-14,-45,30,46);
  ctx.lineCap='round';ctx.lineJoin='round';
  // Painted guide rails stay quiet in the centre, where the ball needs contrast.
  ctx.strokeStyle=palette.dark;ctx.lineWidth=.09;ctx.globalAlpha=.32;
  for(const side of [-1,1]){
    ctx.beginPath();ctx.moveTo(side*5,-7);ctx.lineTo(side*9.8,-10);ctx.lineTo(side*9.8,-35);ctx.lineTo(side*5.5,-40);ctx.stroke();
    ctx.beginPath();ctx.moveTo(side*8.7,-15);ctx.bezierCurveTo(side*6,-20,side*7,-33,side*3,-36);ctx.stroke();
  }
  if(table===PINBALL_TABLE.GARDEN){
    for(let row=0;row<15;row++)for(let col=0;col<9;col++){
      const x=-12+col*3,y=-2-row*3;ctx.fillStyle=(row+col)%2?'#faedcf':'#dce2b5';ctx.globalAlpha=.18;ctx.fillRect(x,y-3,3,3);
    }
    ctx.globalAlpha=.5;ctx.strokeStyle='#87a97b';ctx.lineWidth=.13;
    for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(side*9,-13);ctx.bezierCurveTo(side*2,-19,side*12,-26,side*6,-35);ctx.stroke();
      for(let i=0;i<10;i++){
        const x=side*(8+Math.sin(i*.7)),y=-15-i*2;
        ctx.fillStyle=i%3?'#89aa80':'#e3a0a1';ctx.beginPath();ctx.ellipse(x,y,.5,.22,side*.5,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalAlpha=.2;ctx.strokeStyle='#a88463';ctx.lineWidth=.2;ctx.beginPath();ctx.ellipse(0,-18,4,2.8,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<8;i++){ctx.beginPath();ctx.arc(Math.cos(i*.79)*3,-18+Math.sin(i*.79)*2,.35,0,Math.PI*2);ctx.stroke();}
  }
  if(table===PINBALL_TABLE.CLOCK){
    ctx.globalAlpha=.12;ctx.strokeStyle='#d6e9df';ctx.lineWidth=.055;
    for(let x=-12;x<=12;x+=2){ctx.beginPath();ctx.moveTo(x,-42);ctx.lineTo(x,-7);ctx.stroke();}
    for(let y=8;y<43;y+=2){ctx.beginPath();ctx.moveTo(-11,-y);ctx.lineTo(11,-y);ctx.stroke();}
    ctx.globalAlpha=.65;ctx.strokeStyle='#eab87e';ctx.lineWidth=.12;
    for(const [x,y,r]of [[0,-17,3.6],[-7,-36,2.7],[7,-18,2.1]]){
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,r*.78,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(x+Math.sin(a)*r*.84,y+Math.cos(a)*r*.84);ctx.lineTo(x+Math.sin(a)*r*.94,y+Math.cos(a)*r*.94);ctx.stroke();}
    }
    for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*7,-12);ctx.lineTo(side*6,-20);ctx.lineTo(side*9,-24);ctx.stroke();}
  }
  if(table===PINBALL_TABLE.MOON){
    ctx.globalAlpha=.8;
    for(let i=0;i<76;i++){
      const x=-10+(i*7.618%20),y=-9-(i*4.39%31);starShape(ctx,x,y,i%5===0?.18:.07,i%3?'#bfcef3':'#ffe6ac');
    }
    ctx.globalAlpha=.25;ctx.strokeStyle='#acaff7';ctx.lineWidth=.09;
    for(const [x,y,rx,ry]of [[0,-26,9,12],[0,-26,6,8],[0,-26,3,4]]){ctx.beginPath();ctx.ellipse(x,y,rx,ry,-.25,0,Math.PI*2);ctx.stroke();}
    ctx.globalAlpha=.45;ctx.strokeStyle='#e7ddad';ctx.beginPath();ctx.moveTo(-7,-17);ctx.lineTo(-3,-20);ctx.lineTo(2,-17);ctx.lineTo(5,-21);ctx.stroke();
    for(const [x,y]of [[-7,-17],[-3,-20],[2,-17],[5,-21]])starShape(ctx,x,y,.27,'#ffe4a1');
  }
  ctx.globalAlpha=1;
  // Small chevrons show launch and return lanes without floating over the action.
  ctx.strokeStyle=palette.dark;ctx.lineWidth=.16;
  for(let y=8;y<35;y+=4){ctx.beginPath();ctx.moveTo(12.55,-y+.6);ctx.lineTo(13,-y);ctx.lineTo(13.45,-y+.6);ctx.stroke();}
  for(const side of [-1,1])for(let y=12;y<21;y+=3.5){ctx.beginPath();ctx.moveTo(side*8.8,-y);ctx.lineTo(side*8.1,-y+1);ctx.lineTo(side*7.4,-y);ctx.stroke();}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=2;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(SURFACE.width,SURFACE.length),new THREE.MeshLambertMaterial({map}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(SURFACE.centerX,.12,-SURFACE.centerY);return mesh;
}

export function buildTableScenery(table,material){
  const palette=PINBALL_PALETTES[table],group=new THREE.Group(),parts=[];group.add(surface(table,palette));
  parts.push(box(1,-1.25,-22,30.7,2.6,46.8,palette.body),box(-14.1,.3,-22,.75,.8,46.9,palette.rim),
    box(16.1,.3,-22,.75,.8,46.9,palette.rim),box(1,.3,-45,30.8,.8,.8,palette.rim),
    box(1,.15,1.4,30.7,.7,1.1,palette.rim),box(1,-.35,2,30.7,1.3,.7,palette.body));
  for(const x of [-12.5,14.5])for(const z of [-41,-2])parts.push(cylinder(x,-3,z,.55,3.7,palette.rim),orb(x,-4.8,z,.85,.25,.85,palette.body));
  for(let x=-10;x<=12;x+=1.8)parts.push(box(x,-.4,2.41,.8,.17,.07,palette.rim));
  for(const side of [-1,1]){
    const x=side<0?-14.65:16.65;
    parts.push(orb(x,-.3,-5,.45,.45,1.25,palette.accent));
    for(let y=6;y<43;y+=4)parts.push(orb(side<0?-14.15:16.15,.78,-y,.18,.13,.18,palette.accent));
  }
  if(table===PINBALL_TABLE.GARDEN){
    // A greenhouse and a pudding snail bookend the garden; neither covers a lane.
    parts.push(box(-8,1.2,-46.4,6.8,2.1,2.3,0xc4ddd2));
    for(const x of [-11.1,-8,-4.9])parts.push(box(x,2,-45.1,.18,3.3,.12,0x528f7d));
    parts.push(pipe([[-11.5,2.8,-45.1],[-8,5,-45.1],[-4.5,2.8,-45.1]],.16,0x528f7d));
    for(const x of [-10,-8,-6])parts.push(orb(x,1.4,-45.1,.65,1,.45,0x8fc091));
    parts.push(orb(7,1.3,-46,3.4,.8,1.25,0x7ba98b),orb(5.8,2.35,-46,2.1,2.1,1.3,0xd9909c),
      ring(5.8,2.35,-44.67,1.2,.15,0xffd8a8).rotateX(0));
    parts.push(orb(9.5,2,-45.2,.9,.8,.65,0x8bbc91));eyes(parts,9.5,2.3,-44.6,.12);
    for(const x of [9,10])parts.push(pipe([[x,2.5,-45.4],[x,3.15,-45.45]],.09,0x7ba98b),orb(x,3.25,-45.45,.22,.22,.22,0xffd89b));
    for(const side of [-1,1]){
      const x=side<0?-12.7:15.2;
      parts.push(pipe([[x,.55,-8],[x-.4,1,-19],[x+.4,1.5,-30],[x,1,-41]],.19,0x65966e));
      for(let i=0;i<7;i++){
        const y=8+i*5;parts.push(orb(x,.72,-y,.7,.18,1.05,0x91b57d));
        if(i%2===0)flower(parts,x,1.2,-y,.85,i%3?0xf2b292:0xdc90aa);
      }
    }
  }
  if(table===PINBALL_TABLE.CLOCK){
    // The roof and exposed gear train make the scoop read as a working clock.
    parts.push(box(0,2.7,-46.4,11,5.2,2.4,0x49617d),box(0,2.7,-44.95,10.4,4.8,.3,0xd5b786),
      pipe([[-6,5.1,-45],[0,8,-45],[6,5.1,-45]],.35,0x735769));
    const clock=new THREE.CylinderGeometry(2.15,2.15,.16,36).rotateX(Math.PI/2).translate(0,3.5,-44.65);parts.push(paint(clock,0xf5e7bd));
    parts.push(pipe([[0,3.5,-44.52],[-1,4.2,-44.52]],.13,INK),pipe([[0,3.5,-44.5],[.5,4.9,-44.5]],.11,INK));
    for(let i=0;i<12;i++){const a=i*Math.PI/6;parts.push(orb(Math.sin(a)*1.75,3.5+Math.cos(a)*1.75,-44.47,.09,.09,.045,0x736351));}
    for(const side of [-1,1]){
      const x=side<0?-12.8:15;for(let i=0;i<5;i++)gear(parts,x,.4,-9-i*7,i%2?.95:1.15,i%2?0xd59b5d:0x87a4af);
      parts.push(pipe([[x,.3,-11],[x,1.7,-17],[x,.3,-23],[x,1.7,-29],[x,.3,-35]],.12,0xe2ba7c));
    }
    for(const x of [-4,4])parts.push(cylinder(x,1.1,-44.5,.55,1.8,0x839b9e));
  }
  if(table===PINBALL_TABLE.MOON){
    // A smiling moon watches a miniature observatory, with low constellations at the sides.
    parts.push(orb(-6.2,3.4,-46,3.9,3.9,1.5,0xf7e3a2));
    for(const [x,y,r]of [[-8.2,4.6,.6],[-7.8,1.8,.8],[-5.4,5.8,.4]])parts.push(orb(x,y,-44.56,r,r,.09,0xd7c990));
    eyes(parts,-5.6,3.6,-44.48,.16);parts.push(orb(-5.6,2.8,-44.43,.3,.15,.04,0xc49c89));
    parts.push(box(7,1.1,-46,5.6,2,3,0x747ec3),orb(7,2.3,-46,3.1,2.5,2.1,0xa3b6e8),
      pipe([[6.7,2.5,-44.7],[8.3,4,-44.1]],.55,0xffda8c),orb(8.4,4.1,-44,.7,.7,.32,0x405b82));
    for(const side of [-1,1]){
      const x=side<0?-12.7:15;
      for(let i=0;i<6;i++){
        const y=9+i*6;parts.push(orb(x,.38,-y,.45,.13,.45,0xffe1a1));
        if(i<5)parts.push(beam(x,y,x,y+6,.045,0x8dabea,.25));
        if(i%2)parts.push(ring(x,.45,-y,.8,.06,0x94a5e3));
      }
    }
  }
  group.add(batch(parts,material));return group;
}

export function buildTarget(table,radius,material){
  const p=PINBALL_PALETTES[table],parts=[cylinder(0,.22,0,radius+.2,.35,p.body),ring(0,.44,0,radius,.11,CREAM)];
  const flourish=new THREE.Group();
  if(table===PINBALL_TABLE.GARDEN){
    parts.push(cylinder(0,.7,0,radius*.8,.8,0xe8c883),orb(0,1.11,0,radius*.82,.35,radius*.82,0xf3b0b2));
    flower(parts,0,1.55,0,.65,0xffecd2);eyes(parts,0,1.01,radius*.8,.12);
    const petals=[];for(let i=0;i<6;i++){const a=i*Math.PI/3;petals.push(orb(Math.cos(a)*1.7,.43,Math.sin(a)*1.7,.75,.18,.38,0xf7afbb));}flourish.add(batch(petals,material));
  }
  if(table===PINBALL_TABLE.CLOCK){
    parts.push(box(0,.94,0,1.5,1.6,1,0xe1ae64),box(0,1.03,.53,1.22,1.3,.1,CREAM));
    eyes(parts,0,1.25,.63,.12);parts.push(orb(0,.8,.65,.22,.08,.08,0xd17f71),orb(0,1.98,0,.34,.4,.34,p.accent));
    const key=[beam(-.8,0,.8,0,.13,p.light,1.8),orb(-.8,1.8,0,.35,.1,.35,p.light),orb(.8,1.8,0,.35,.1,.35,p.light)];flourish.add(batch(key,material));
  }
  if(table===PINBALL_TABLE.MOON){
    parts.push(orb(0,.96,0,radius*.81,.78,radius*.81,0x9ca7ea),ring(0,.8,0,radius*.96,.1,0xe4d596));
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;parts.push(orb(Math.cos(a)*.64,1.5,Math.sin(a)*.64,.3,.24,.3,0xffde79));}
    parts.push(orb(0,1.58,0,.45,.25,.45,0xffe8a2));eyes(parts,0,1.08,radius*.82,.12);
    flourish.add(batch([ring(0,.3,0,radius+.7,.065,p.light),ring(0,.34,0,radius+1,.035,p.light)],material));
  }
  const group=new THREE.Group(),body=batch(parts,material);group.add(body,flourish);return {group,body,flourish};
}

export function buildBumper(table,radius,material){
  const p=PINBALL_PALETTES[table],parts=[cylinder(0,.27,0,radius+.13,.38,p.body),ring(0,.45,0,radius,.12,CREAM)];
  if(table===PINBALL_TABLE.GARDEN){
    parts.push(cylinder(0,.77,0,radius*.73,.8,0xffe1a0),orb(0,1.3,0,radius,.52,radius,0xd98798));
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;parts.push(orb(Math.cos(a)*.76,1.72,Math.sin(a)*.76,.23,.13,.23,0xfff0c8));}
    parts.push(orb(0,1.85,0,.28,.25,.28,0xa34f75));eyes(parts,0,.9,radius*.72,.13);
  }
  if(table===PINBALL_TABLE.CLOCK){
    gear(parts,0,.65,0,radius,p.accent);parts.push(orb(0,1.15,0,.9,.8,.8,0x96bab8),orb(0,1.46,.76,.28,.15,.32,0xe9ab55));
    eyes(parts,0,1.68,.6,.12);parts.push(orb(-.9,1.12,0,.35,.23,.9,0x6a8b98),orb(.9,1.12,0,.35,.23,.9,0x6a8b98));
  }
  if(table===PINBALL_TABLE.MOON){
    parts.push(orb(0,1,0,radius*.83,.92,radius*.83,0xb4dce5),ring(0,.9,0,radius+.12,.16,0xdbaeca));
    for(const [x,z]of [[-.5,-.2],[.4,-.5],[.2,.6]])parts.push(orb(x,1.74,z,.22,.06,.24,0x7cabcc));
    eyes(parts,0,1.2,radius*.8,.13);parts.push(orb(0,.85,radius*.87,.25,.12,.07,0x7a91ad));
  }
  return batch(parts,material);
}

export function buildTableBackdrop(table){
  const p=PINBALL_PALETTES[table],canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),color=new THREE.Color(p.back),light=`#${color.clone().lerp(new THREE.Color(0xffeedc),.42).getHexString()}`;
  const shade=`#${color.clone().multiplyScalar(.65).getHexString()}`,gradient=ctx.createRadialGradient(250,210,20,256,256,340);
  gradient.addColorStop(0,light);gradient.addColorStop(1,shade);ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
  // Quiet floor motifs frame the cabinet, leaving the ball field uncluttered.
  ctx.globalAlpha=.13;ctx.strokeStyle='#fff3d1';ctx.lineWidth=1;
  for(let i=0;i<28;i++){
    const x=(i*173)%512,y=(i*97)%512,r=4+i%4;
    if(table===PINBALL_TABLE.MOON){starShape(ctx,x,y,r,'#e9e1ef');continue;}
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    if(table===PINBALL_TABLE.CLOCK){ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.stroke();}
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const group=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.MeshBasicMaterial({map}));
  floor.rotation.x=-Math.PI/2;floor.position.set(0,-5.3,-22);group.add(floor);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const shadowCtx=shadowCanvas.getContext('2d'),shadowGradient=shadowCtx.createRadialGradient(64,64,18,64,64,64);
  shadowGradient.addColorStop(0,'rgba(14,25,48,.4)');shadowGradient.addColorStop(.58,'rgba(14,25,48,.28)');shadowGradient.addColorStop(1,'rgba(14,25,48,0)');
  shadowCtx.fillStyle=shadowGradient;shadowCtx.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(43,65),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.set(1.5,-5.2,-21);group.add(shadow);return group;
}

export function buildToyShutter(spec){
  if(spec.table!==PINBALL_TABLE.CLOCK)return null;
  const geometry=new THREE.CapsuleGeometry(MARBLE_CLOCK_GATE.barRadius,spec.mouth.radius*2,4,12).rotateZ(Math.PI/2);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:PINBALL_PALETTES[spec.table].accent}));
  mesh.position.set(spec.mouth.x,.65,-spec.mouth.y);return mesh;
}

export function buildNoteBadge(table){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff1cb';ctx.beginPath();ctx.arc(64,64,55,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=table===PINBALL_TABLE.GARDEN?'#8d506b':'#405575';ctx.font='bold 95px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('♪',62,68);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(0,.23,2.5);return mesh;
}
