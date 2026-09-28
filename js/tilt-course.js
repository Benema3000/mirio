// One shared map defines the rendered board, gravity slopes and checkpoint routes.
export const TILT_START = Object.freeze({x:0,y:4,height:0});
export const TILT_FINISH = Object.freeze({x:0,y:150,height:2.2,radius:7});
export const TILT_CHECKPOINTS = Object.freeze([
  {id:'rainbow',index:1,x:8,y:30,height:1.4,radius:5.4,name:'Regenbogensteg'},
  {id:'basin',index:2,x:0,y:78,height:.5,radius:6.3,name:'Schaumlagune'},
  {id:'towel',index:3,x:0,y:122,height:1.5,radius:6,name:'Handtuchhimmel'},
]);
export const TILT_BASIN = Object.freeze({x:0,y:78,radius:3.5,chargeTime:1.1});
export const TILT_PATHS = Object.freeze([
  {id:'wash',stage:0,width:7,color:0xd8dfb8,points:[[0,4,0],[0,17,.8],[8,30,1.4]]},
  {id:'rainbow-safe',stage:1,width:6.4,color:0xc8d5de,points:[[8,30,1.4],[-17,42,2],[-17,61,1.2],[0,78,.5]]},
  {id:'rainbow-ribbon',stage:1,width:2.9,color:0xe6b5d0,bank:.095,shortcut:true,points:[[8,30,1.4],[14,47,3],[10,61,3],[0,78,.5]]},
  {id:'lagoon-safe',stage:2,width:6.4,color:0xaed8d1,points:[[0,78,.5],[-18,91,.2],[-18,109,0],[0,122,1.5]]},
  {id:'foam',stage:2,width:4.2,color:0xf6edcf,bank:.05,shortcut:true,requiresFoam:true,points:[[0,78,.5],[10,92,2.2],[8,106,2.5],[0,122,1.5]]},
  {id:'towel-safe',stage:3,width:6.4,color:0xf0d5a2,bank:.045,points:[[0,122,1.5],[12,135,3],[0,150,2.2]]},
  {id:'towel-ribbon',stage:3,width:2.9,color:0xb9cee8,shortcut:true,points:[[0,122,1.5],[-5,136,3.2],[0,150,2.2]]},
]);
const ROOMS=Object.freeze([{id:'start',...TILT_START,radius:6},...TILT_CHECKPOINTS,{id:'finish',...TILT_FINISH}]);
const STATIONS=Object.freeze([4,30,78,122,150]);
const HEIGHT_BLEND=6;
const ROAD_HEIGHT_BLEND=8;
const GRADIENT_SAMPLE=.035;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>t*t*(3-2*t);

const SEGMENTS=TILT_PATHS.flatMap(path=>{
  const lengths=path.points.slice(1).map((p,i)=>Math.hypot(p[0]-path.points[i][0],p[1]-path.points[i][1]));
  const total=lengths.reduce((sum,n)=>sum+n,0);let travelled=0;
  return lengths.map((length,index)=>{
    const segment={path,a:path.points[index],b:path.points[index+1],length,travelled,total};travelled+=length;return segment;
  });
});

function nearest(x,y,{bridgeOpen=false}={}){
  let road=null,room=null;
  for(const segment of SEGMENTS){
    if(segment.path.requiresFoam&&!bridgeOpen)continue;
    const {a,b,length}=segment,dx=b[0]-a[0],dy=b[1]-a[1];
    const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(length*length),0,1);
    const cx=a[0]+dx*t,cy=a[1]+dy*t,radial=Math.hypot(x-cx,y-cy),edge=radial-segment.path.width/2;
    if(road&&edge>=road.distance)continue;
    road={distance:edge,x:cx,y:cy,segment,t,radial};
  }
  for(const candidate of ROOMS){
    const radial=Math.hypot(x-candidate.x,y-candidate.y),edge=radial-candidate.radius;
    if(room&&edge>=room.distance)continue;
    room={distance:edge,radial,spec:candidate};
  }
  return {road,room};
}

function surfaceHeight(x,y){
  const {room}=nearest(x,y,{bridgeOpen:true});
  const samples=SEGMENTS.map(({a,b,length,path})=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(length*length),0,1);
    const radialSquared=(x-a[0]-dx*t)**2+(y-a[1]-dy*t)**2;
    return {radialSquared,height:a[2]+(b[2]-a[2])*t+radialSquared*(path.bank||0)};
  });
  const closest=Math.min(...samples.map(sample=>sample.radialSquared));let weighted=0,total=0;
  // Blend overlapping road heights so joining a fork cannot introduce a hidden gravity seam.
  for(const sample of samples){
    const weight=Math.exp(-(sample.radialSquared-closest)/ROAD_HEIGHT_BLEND);
    weighted+=sample.height*weight;total+=weight;
  }
  const height=weighted/total,blend=smooth(clamp(-room.distance/HEIGHT_BLEND,0,1));
  return height+(room.spec.height-height)*blend;
}

/** Signed distance is positive over a gap. Slopes are derivatives of the visible floor. */
export function tiltFloor(x,y,{bridgeOpen=false}={}){
  const {road,room}=nearest(x,y,{bridgeOpen}),{path}=road.segment;
  const progress=STATIONS[path.stage]+(STATIONS[path.stage+1]-STATIONS[path.stage])
    *(road.segment.travelled+road.segment.length*road.t)/road.segment.total;
  return {distance:Math.min(road.distance,room.distance),height:surfaceHeight(x,y),
    slopeX:(surfaceHeight(x+GRADIENT_SAMPLE,y)-surfaceHeight(x-GRADIENT_SAMPLE,y))/(GRADIENT_SAMPLE*2),
    slopeY:(surfaceHeight(x,y+GRADIENT_SAMPLE)-surfaceHeight(x,y-GRADIENT_SAMPLE))/(GRADIENT_SAMPLE*2),
    x:road.x,y:road.y,route:path.id,stage:path.stage,shortcut:Boolean(path.shortcut),progress,
    room:room.distance<0?room.spec.id:null};
}

export function tiltCourse(){
  return {start:TILT_START,finish:TILT_FINISH,checkpoints:TILT_CHECKPOINTS,basin:TILT_BASIN,paths:TILT_PATHS,
    rooms:ROOMS,stations:STATIONS};
}
