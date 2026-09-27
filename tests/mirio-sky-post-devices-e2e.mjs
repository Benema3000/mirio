import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT ?? 'playwright');
const b=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try {
await p.addInitScript(()=>{window.pad={connected:false,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.pad]});});
await p.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:8766/'}?test&menu`);await p.waitForFunction(()=>window.__mirio&&!document.querySelector('#start').disabled,null,{timeout:120000});
await p.tap('[data-level=sky]');await p.tap('#start');await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun?.countdown===0);
await p.tap('#btn-spin');await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.boost>0);
await p.tap('#btn-jump');await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.roll>0);
// Touch steering uses the canvas's ordinary pointer path.
const cdp=await context.newCDPSession(p);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:100,y:550}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145,y:550}]});
await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.x>6,null,{timeout:60000});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.deliveryTarget!==null,null,{timeout:60000});
await p.tap('#btn-spin');await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.parcelInFlight);
assert.match(await p.textContent('#chapter-ability'), /Unterwegs/, 'do not offer Turbo while the parcel action is busy');
if(process.env.SHOTS)await p.screenshot({path:`${process.env.SHOTS}/sky-phone-return.png`});
await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.parcelReturns===1,null,{timeout:60000});
// Retry via controller stick + X; both devices reach the same postal rules.
await p.evaluate(()=>{window.pad.connected=true;window.pad.axes[0]=-1;});
await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.x< -5,null,{timeout:60000});
await p.evaluate(()=>{window.pad.axes[0]=0;window.pad.buttons[2]={pressed:true,value:1};});
await p.waitForFunction(()=>window.__mirio.snapshot().chapterRun.deliveries===1,null,{timeout:60000});
await p.evaluate(()=>{window.pad.connected=false;});
if(process.env.SHOTS)await p.screenshot({path:`${process.env.SHOTS}/sky-phone-delivered.png`});
const run=await p.evaluate(()=>window.__mirio.snapshot().chapterRun);assert.equal(run.parcelReturns,1);assert.equal(run.deliveries,1);
for(const selector of ['#pause-button','#btn-spin','#btn-jump']){const r=await p.locator(selector).boundingBox();assert.ok(r.x>=0&&r.x+r.width<=390&&r.y>=0&&r.y+r.height<=844,selector);}
await p.tap('#pause-button');const time=await p.evaluate(()=>window.__mirio.snapshot().chapterRun.time);await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>window.__mirio.snapshot().chapterRun.time),time);
assert.deepEqual(errors,[]);console.log('PASS touch, controller, parcel retry, pause, portrait layout');
} finally { await b.close(); }
