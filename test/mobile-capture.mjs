import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,webkit} from 'playwright-core';
import {serve,watch,openMarkOptions} from './lib.mjs';
import '../scripts/fixtures.mjs';
const kind=process.env.PLAYWRIGHT_BROWSER||'chromium',type={chromium,webkit}[kind];
const launchOptions={headless:process.env.PLAYWRIGHT_HEADLESS!=='false',executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||type.executablePath(),args:kind==='chromium'?['--no-sandbox','--autoplay-policy=document-user-activation-required']:[]};
let browser=await type.launch(launchOptions);
const {srv,port}=serve('site');const errors=[];let count=0;
const check=(ok,msg)=>{assert.ok(ok,msg);console.log('ok',++count,msg)};
const folder='test/audit/mobile-repair';mkdirSync(folder,{recursive:true});
const sizes=[[320,568],[360,640],[390,700],[430,932],[844,390]];
async function open(width,height,strict=false){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1,acceptDownloads:true});context.setDefaultTimeout(12000);
 if(strict)await context.addInitScript(()=>{
  const realPlay=HTMLMediaElement.prototype.play,realLoad=HTMLMediaElement.prototype.load,unlocked=new WeakSet();let gesture=false;
  window.__mediaTrace=[];
  const note=(audio,event,error)=>{if(audio.id!=='audio')return;window.__mediaTrace.push({event,at:Math.round(performance.now()),ready:audio.readyState,paused:audio.paused,src:audio.currentSrc||audio.getAttribute('src'),error:error?{name:error.name,message:error.message}:audio.error?{code:audio.error.code,message:audio.error.message}:undefined});if(window.__mediaTrace.length>70)window.__mediaTrace.shift()};
  for(const event of ['loadstart','loadedmetadata','canplay','playing','pause','emptied','abort','error'])document.addEventListener(event,e=>note(e.target,event),true);
  HTMLMediaElement.prototype.load=function(){note(this,'load');return realLoad.call(this)};
  document.addEventListener('click',event=>{if(event.isTrusted){gesture=true;setTimeout(()=>{gesture=false},0)}},true);
  HTMLMediaElement.prototype.play=function(){note(this,'play.call');if(window.__rejectNextMediaPlay){window.__rejectNextMediaPlay=false;return Promise.reject(new DOMException('Simulated first play rejection','NotAllowedError'))}if(!gesture&&!unlocked.has(this))return Promise.reject(new DOMException('A real Start gesture is required','NotAllowedError'));unlocked.add(this);const pending=realPlay.call(this);pending.then(()=>note(this,'play.resolved'),error=>note(this,'play.rejected',error));return pending};
 });
 const page=await context.newPage();watch(page,errors);page.on('dialog',d=>d.accept());await page.goto(`http://localhost:${port}/`);await page.bringToFront();await page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
 await page.evaluate(()=>{window.__tapTrace=[];for(const name of ['pointerdown','pointerup','lostpointercapture'])document.addEventListener(name,event=>{if(!event.target.closest?.('.pad'))return;const a=window.__app,m=a.panels.mark;window.__tapTrace.push({event:name,id:event.pointerId,stamp:event.timeStamp,now:performance.now(),native:a.audio.currentTime,seeking:a.audio.seeking,t:a.player.t,cur:{...m.cur},hold:!!m.hold});if(window.__tapTrace.length>20)window.__tapTrace.shift()},true)});
 await page.setInputFiles('#songfile','test/media/kick120.wav');await page.waitForFunction(()=>window.__app.media&&!window.__app.loadController);return{page,context};
}
async function close(page,context){
 await page.evaluate(()=>window.__app.destroy());await context.close();
}
async function fill(page,fmt){
 await page.getByRole('button',{name:'Más controles',exact:true}).tap();await page.getByLabel('Forma de la pantalla',{exact:true}).selectOption(fmt);await page.getByRole('button',{name:'Más controles',exact:true}).tap();
 await page.locator('#tab-text').tap();await page.locator('.lyrics').fill('Música contigo\nToca ahora\nÚltima frase');
 if((await page.viewportSize()).width<=600){await page.waitForFunction(()=>Math.abs(document.querySelector('.step-footer').getBoundingClientRect().bottom-innerHeight)<2);check(await page.locator('.step-footer').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight)<2),'text editing uses the remaining screen instead of leaving an empty grid row');}
 await page.getByRole('button',{name:'Siguiente: Marcar',exact:true}).tap();
 check(await page.evaluate(()=>window.__app.tab==='mark'),'one real touch continues from text ('+fmt+')');
}
async function hitArea(page){return page.evaluate(()=>{const a=window.__app,m=a.panels.mark,r=m.pad.getBoundingClientRect(),panel=a.panelEl.getBoundingClientRect();return{hidden:!a.canvas.offsetParent,w:r.width,h:r.height,inside:r.y>=panel.y&&r.bottom<=panel.bottom+1&&r.y>=0&&r.bottom<=innerHeight,hit:[.15,.5,.85].every(x=>[.15,.5,.85].every(y=>document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.closest('.pad')===m.pad)),scroll:m.el.scrollHeight-m.el.clientHeight}})}
try{
 const matrix=process.env.MOBILE_STRICT_ONLY?null:await open(...sizes[0]);
 for(const [width,height]of (process.env.MOBILE_STRICT_ONLY?[]:sizes))for(const fmt of ['wide','tall','square']){
  const {page}=matrix;await page.setViewportSize({width,height});await page.locator('#tab-song').tap();await fill(page,fmt);
  const done=await page.evaluate(()=>window.__app.panels.mark.phase==='done');
  const start=done?page.getByRole('button',{name:'↻ Marcar otra vez',exact:true}):page.locator('.mcard.idle .primary');
  check(await start.isVisible(),`${width}×${height} ${fmt}: Start is available`);
  if(!done){await openMarkOptions(page);await page.getByRole('button',{name:'Solo frases',exact:true}).tap();if(await page.locator('.mopts .switch input').isChecked())await page.locator('.mopts .switch').tap();if(await page.locator('.mopts-toggle').isVisible())await page.locator('.mopts-toggle').tap()}
  await start.tap();
  try {await page.waitForFunction(()=>window.__app.panels.mark.phase==='run'&&!window.__app.audio.paused)}
  catch(error){console.log('mobile start diagnostic',await page.evaluate(()=>{const a=window.__app,m=a.panels.mark;return{phase:m.phase,reason:m.reason,countOn:m.countOn,player:a.player.state,paused:a.audio.paused,ready:a.audio.readyState,playError:a.player.lastPlayError,src:a.audio.currentSrc,error:a.audio.error?.message,tab:a.tab,active:document.activeElement?.outerHTML.slice(0,250),button:m.startBtn.getBoundingClientRect().toJSON(),panel:a.panelEl.getBoundingClientRect().toJSON(),scroll:m.el.scrollTop}}));throw error}
  const area=await hitArea(page);check(area.hidden&&area.inside&&area.hit&&area.h>=140,`${width}×${height} ${fmt}: the capture pad is visible, unobstructed and owns the workspace ${JSON.stringify(area)}`);
  await page.locator('.pad').tap();await page.waitForTimeout(360);
  const first=await page.locator('.pad').boundingBox();await page.getByRole('button',{name:'Pausar',exact:true}).tap();await page.waitForTimeout(500);
  await page.locator('.mcard.pause .primary').tap();await page.waitForFunction(()=>window.__app.panels.mark.phase==='run');
  await page.waitForFunction(()=>{const a=window.__app;return !a.audio.seeking&&a.audio.currentTime>a.project.sync[0].t+.35&&a.player.t>a.project.sync[0].t+.35});
  const resumed=await page.locator('.pad').boundingBox();check(Math.abs(first.y-resumed.y)<2,`${width}×${height} ${fmt}: capture target stays in place after pause/resume`);
  await page.locator('.pad').tap();await page.waitForFunction(()=>{const a=window.__app;return !a.audio.seeking&&a.audio.currentTime>a.panels.mark.lastMarkAbs()+.35});await page.locator('.pad').tap();
  try{await page.waitForFunction(()=>window.__app.panels.mark.phase==='done')}
  catch(error){console.log('capture diagnostic',JSON.stringify(await page.evaluate(()=>{const a=window.__app,m=a.panels.mark;return{phase:m.phase,mode:m.mode,cur:m.cur,sync:a.project.sync,native:a.audio.currentTime,seeking:a.audio.seeking,clock:a.player.t,trace:window.__tapTrace}})));throw error}
  check(await page.evaluate(()=>window.__app.project.sync.filter(Boolean).length===3),`${width}×${height} ${fmt}: three actual touches save three phrases`);
  if(fmt==='tall'&&width===390)await page.screenshot({path:`${folder}/after-tall-complete-${kind}.png`});await page.waitForFunction(()=>!window.__app.panels.mark.locked());
 }
 if(matrix){
  await matrix.page.setViewportSize({width:390,height:700});await matrix.page.reload();await matrix.page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
  await matrix.page.locator('#tab-words').tap();await matrix.page.waitForTimeout(300);
  check(await matrix.page.evaluate(()=>window.__app.project.sync.filter(Boolean).length===3&&!window.__app.player.demo),'restored marked lyrics stay paused when the phone preview is collapsed');
  await close(matrix.page,matrix.context);
 }
 for(const mode of ['phrase','word']){
  if(kind==='webkit'){await browser.close();browser=await type.launch(launchOptions)}
  const [width,height]=mode==='phrase'?[320,568]:[390,700];
  const {page,context}=await open(width,height,true);await fill(page,'tall');
  await openMarkOptions(page);if(mode==='word')await page.getByRole('button',{name:'Palabra por palabra',exact:true}).tap();
  if(await page.locator('.mopts-toggle').isVisible())await page.locator('.mopts-toggle').tap();
  await page.locator('.mcard.idle .primary').tap();await page.waitForTimeout(150);
  check(await page.evaluate(()=>window.__app.panels.mark.phase==='count'&&window.__app.audio.paused),`strict gesture ${mode}: countdown is silent and does not play the song early`);
  check(await page.locator('.mcard.count .btn').evaluate(el=>{const r=el.getBoundingClientRect(),z=el.closest('.mzone').getBoundingClientRect();return r.height>=44&&r.y>=z.y&&r.bottom<=z.bottom+1&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el}),`countdown ${width}×${height}: Cancel remains visible and touchable`);
  try{await page.waitForFunction(()=>window.__app.panels.mark.phase==='run'&&!window.__app.audio.paused,null,{timeout:6000})}
  catch(error){console.log('strict audio diagnostic',JSON.stringify(await page.evaluate(()=>({phase:window.__app.panels.mark.phase,reason:window.__app.panels.mark.reason,playError:window.__app.player.lastPlayError,ready:window.__app.audio.readyState,epoch:window.__app.player.playEpoch,trace:window.__mediaTrace}))));throw error}
  await page.waitForTimeout(200);
  check(await page.evaluate(()=>window.__app.player.t>.05),`strict gesture ${mode}: the audio actually advances after the countdown`);
  await page.screenshot({path:`${folder}/after-tall-running-${mode}-${kind}.png`});
  for(let i=0;i<(mode==='phrase'?3:6);i++){await page.locator('.pad').tap();await page.waitForTimeout(360)}
  check(await page.evaluate(()=>window.__app.panels.mark.phase==='done'&&window.__app.project.sync.filter(Boolean).length===3),`strict gesture ${mode}: marking completes using native touches`);await close(page,context);
 }
 if(kind==='webkit'){await browser.close();browser=await type.launch(launchOptions)}
 const recovery=await open(390,700,true);await fill(recovery.page,'tall');
 await recovery.page.evaluate(()=>{window.__rejectNextMediaPlay=true});await recovery.page.locator('.mcard.idle .primary').tap();
 await recovery.page.waitForFunction(()=>window.__app.panels.mark.reason==='blocked'&&!window.__app.panels.mark.locked(),null,{timeout:6000});
 await recovery.page.locator('.mcard.pause .primary').tap();await recovery.page.waitForFunction(()=>window.__app.panels.mark.phase==='run'&&!window.__app.audio.paused);
 check(true,'a rejected countdown unlock recovers on one direct Resume touch without repeating the countdown');await close(recovery.page,recovery.context);
 const {page,context}=await open(390,700);await page.locator('#tab-style').tap();
 await page.getByRole('button',{name:'Ocultar vista previa',exact:true}).tap();check(!(await page.locator('.stagefs').isVisible()),'preview can be collapsed to work on controls');
 await page.getByRole('button',{name:'Grueso',exact:true}).tap();await page.waitForFunction(()=>window.__app.needRebuild);
 await page.getByRole('button',{name:'Mostrar vista previa',exact:true}).tap();check(await page.locator('.stagefs').isVisible(),'preview can be restored without removing controls');
 await page.waitForFunction(()=>!window.__app.needRebuild&&window.__app.scene.thickG===window.__app.project.style.thick);
 check(true,'reopening the preview renders edits made while it was collapsed');
 await page.getByRole('button',{name:'Más controles',exact:true}).tap();check(await page.getByLabel('Forma de la pantalla').isVisible()&&await page.getByLabel('Velocidad',{exact:true}).isVisible(),'format and playback speed remain available on phone');await close(page,context);
 assert.deepEqual(errors,[]);console.log(`${count} mobile capture checks passed (${kind})`);
}finally{await browser.close();srv.close()}
