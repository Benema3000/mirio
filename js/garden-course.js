// A connected garden: courtyard paths, rooftop windows, and cellar doors form loops.
export const GARDEN = Object.freeze({
  minX: -92, maxX: 188, finishX: 19, finishY: 12,
  interactionRadius: 2.1, portalCooldown: .85, hintDelay: 24,
  dreamAwake: 'awake', dreamAsleep: 'asleep', seedCount: 3, discoveryShare: .85,
});

export function makeGardenCourse() {
  const platforms = [];
  const add = (id, x, y, w, kind = 'petal', extra = {}) => platforms.push({id,x,y,w,kind,...extra});
  add('ground-0', 12, 0, 56, 'ground', {zone: 0});
  add('orchard-floor', -53, 0, 74, 'ground', {zone: 1});
  add('glass-floor', 77, 0, 74, 'ground', {zone: 2});
  add('cellar-floor', 153, 0, 70, 'ground', {zone: 3});

  // A walkable lower garden catches every missed rooftop jump.
  [[-27,2],[-36,3.7],[-45,5.4],[-54,7.1],[-64,8.4],[-74,8.4]].forEach(([x,y],i)=>add(`orchard-${i}`,x,y,6.8,'petal',{zone:1}));
  add('acorn-lift',-82,4,7,'cloud',{move:{axis:'y',amplitude:4,period:8,phase:-Math.PI/2}});
  add('orchard-balcony',-73,6.4,9,'petal',{zone:1});
  add('orchard-return',-43,2,8,'petal',{zone:1});

  // The song trades leafy stairs for sleepy cloud stools; either state is safe.
  [[57,1.7],[65,3.4],[73,5.1],[81,6.8],[89,8.4]].forEach(([x,y],i)=>add(`vine-${i}`,x,y,6.8,'vine',{dream:GARDEN.dreamAwake,zone:2}));
  [[59,1.4],[70,2.8],[81,4.2],[92,5.6]].forEach(([x,y],i)=>add(`dream-${i}`,x,y,9.6,'ghost',{dream:GARDEN.dreamAsleep,zone:2,move:{axis:'x',amplitude:.6,period:5,phase:i}}));
  add('blanket-lift',103,7,8,'ghost',{dream:GARDEN.dreamAsleep,zone:2,move:{axis:'y',amplitude:1.2,period:6,phase:0}});
  add('glass-roof',98,8.4,13,'petal',{zone:2});
  add('glass-sill',106,5.8,7,'petal',{zone:2});

  [[137,1.7],[145,3.4],[153,5.1],[155,1.7]].forEach(([x,y],i)=>add(`cellar-${i}`,x,y,7,'petal',{zone:3}));
  // The seed pod catches the secret window route even when a jump is missed.
  add('cellar-seed-pod',164,3.4,9.6,'petal',{zone:3});
  add('sleepy-stool',173,1.8,6,'ghost',{dream:GARDEN.dreamAsleep,zone:3,move:{axis:'y',amplitude:1.4,period:6,phase:0}});
  add('secret-balcony',145,6.4,8,'petal',{zone:3});

  // Three lantern seeds unfold a compact victory ascent back at the courtyard.
  [[10,2],[19,4],[10,6],[19,8],[10,10],[19,12]].forEach(([x,y],i)=>add(`finale-${i}`,x,y,7,'vine',{gate:true,zone:4}));
  const checkpoints=[
    {id:'home',x:5,y:0,room:'courtyard'}, {id:'orchard',x:-24,y:0,room:'orchard'},
    {id:'glass',x:49,y:0,room:'glass'}, {id:'cellar',x:125,y:0,room:'cellar'},
  ].map((p,index)=>({...p,index}));
  const flowers=[{id:'glass-song',x:49,y:0},{id:'cellar-song',x:130,y:0},{id:'roof-song',x:98,y:8.4}];
  const doors=[
    {id:'home-cellar',x:28,y:0,to:'cellar-home',icon:'☾',label:'Kellergarten'},
    {id:'cellar-home',x:125,y:0,to:'home-cellar',icon:'✿',label:'Blütenhof'},
    {id:'glass-cellar',x:109,y:0,to:'cellar-glass',icon:'☾',label:'Kellergarten'},
    {id:'cellar-glass',x:182,y:0,to:'glass-cellar',icon:'☀',label:'Glashaus'},
    {id:'orchard-window',x:-74,y:8.4,to:'glass-window',icon:'☀',label:'Glashaus'},
    {id:'glass-window',x:102,y:8.4,to:'orchard-window',icon:'♧',label:'Baumhaus'},
    {id:'curtain',x:145,y:6.4,to:'stump',icon:'♧',label:'Geheimweg',secret:true},
    {id:'stump',x:-87,y:0,to:'curtain',icon:'☾',label:'Geheimweg',secret:true},
  ];
  const seeds=[
    {id:'orchard-seed',x:-64,y:9.45,room:'orchard',icon:'♧'},
    {id:'glass-seed',x:94,y:9.45,room:'glass',icon:'☀'},
    {id:'cellar-seed',x:164,y:4.45,room:'cellar',icon:'☾'},
  ];
  const springs=[{id:'orchard-flower',x:-27,y:0,boost:16.7},{id:'cellar-flower',x:137,y:0,boost:16.7}];
  const gems=[];
  for(const p of platforms.filter(p=>!p.dream&&!p.gate&&p.kind!=='ground')) {
    for(const offset of [-1.2,1.2]) gems.push({id:`gem-${gems.length}`,x:p.x+offset,y:p.y+1,route:'blossom',...(p.move?{platform:p.id}:{})});
  }
  for(const x of [-82,-69,-56,-43,-16,-5,34,43,58,73,87,105,132,148,168,179])gems.push({id:`gem-${gems.length}`,x,y:1,route:'ribbon'});
  const critters=[[-40,0],[-66,0],[85,0],[153,0]].map(([x,y],i)=>({id:`puff-${i}`,x,y,range:1.5,phase:i*1.3,speed:.8,spirit:i>1}));
  return {name:'Blütenpfad',version:2,start:{x:5,y:0},finishX:GARDEN.finishX,finishY:GARDEN.finishY,
    platforms,springs,checkpoints,gems,critters,flowers,doors,seeds,
    rooms:[{id:'orchard',name:'Baumhaus',min:-92,max:-16,color:0xc3e8be},{id:'courtyard',name:'Blütenhof',min:-16,max:40,color:0xc0e8ec},
      {id:'glass',name:'Glashaus',min:40,max:115,color:0xd9e7dc},{id:'cellar',name:'Kellergarten',min:115,max:188,color:0x8591bb}]};
}
