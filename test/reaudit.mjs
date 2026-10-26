// Independent regressions for gaps found while reviewing the first repair.
import assert from 'node:assert/strict';
import {copyFileSync,cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {serve,launch,watch} from './lib.mjs';
import {readPayloadFromHtml} from '../js/import.js';
import '../scripts/fixtures.mjs';

mkdirSync('test/audit/reaudit',{recursive:true});copyFileSync('js/store.js','site/reaudit-store.js');
const {srv,port}=serve('site'),browser=await launch(),errors=[];let count=0;
const check=(condition,message)=>{assert.ok(condition,message);console.log('ok',++count,message)};
const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
context.setDefaultTimeout(20000);
const page=await context.newPage();watch(page,errors);page.on('dialog',dialog=>dialog.accept());
const waitReady=()=>page.waitForFunction(()=>document.documentElement.classList.contains('ready'),null,{timeout:20000});
try {
 await page.goto(`http://localhost:${port}/`);await waitReady();
 await page.setInputFiles('#songfile','test/media/kick120.wav');
 await page.waitForFunction(()=>window.__app.media&&!window.__app.loadController,null,{timeout:30000});
 const persisted=await page.evaluate(async()=>{const a=window.__app,s=await import('/reaudit-store.js'),r=await s.getFile(a.id);return !!r?.blob&&r.blob.size===a.file.size&&r.mediaId===a.project.song.mediaId});
 check(persisted,'loaded audio is actually persisted with its matching media identity');
 const cancelled=await page.evaluate(async()=>{
  const a=window.__app,old=a.media;await a.save();const busy=a.busy;let inert=false;
  a.busy=function(...args){busy.apply(this,args);if(args[0]?.startsWith('Recuperando')){inert=this.top.inert&&this.grid.inert;this.cancelLoad()}};
  try {const result=await a.openProject(a.id);return {result,same:a.media===old,inert,restored:!a.top.inert&&!a.grid.inert}}
  finally {a.busy=busy}
 });
 check(!cancelled.result&&cancelled.same&&cancelled.inert&&cancelled.restored,'cancel recovery preserves current audio and restores keyboard access: '+JSON.stringify(cancelled));
 const originalID=await page.evaluate(()=>window.__app.id);
 await page.evaluate(async()=>{const a=window.__app;await a.newAndReset();a.project.text='Second project';await a.save()});
 const secondID=await page.evaluate(()=>window.__app.id);
 const overlap=await page.evaluate(async({first,second})=>{
  const a=window.__app,busy=a.busy;let latest;
  a.busy=function(...args){busy.apply(this,args);if(!latest&&args[0]?.startsWith('Recuperando')){a.busy=busy;latest=a.openProject(second)}};
  try {const initial=await a.openProject(first);return {results:[initial,latest?await latest:false],id:a.id,text:a.project.text,media:!!a.media}}
  finally {a.busy=busy}
 },{first:originalID,second:secondID});
 check(!overlap.results[0]&&overlap.results[1]&&overlap.id===secondID&&!overlap.media&&overlap.text==='Second project','latest project request wins without mixing old audio or text');
 await page.evaluate(id=>window.__app.openProject(id),originalID);
 const stale=await page.evaluate(async(id)=>{
  const transaction=(mode,fn)=>new Promise((resolve,reject)=>{const rq=indexedDB.open('letras-ascii');rq.onsuccess=()=>{const db=rq.result,tx=db.transaction('proyectos',mode);const result=fn(tx.objectStore('proyectos'));tx.oncomplete=()=>{db.close();resolve(result?.result)};tx.onerror=()=>reject(tx.error)}});
  const record=await transaction('readonly',s=>s.get(id+':file'));
  await transaction('readwrite',s=>s.put({...record,mediaId:'stale-media'}));
  await window.__app.openProject(id);const rejected=!window.__app.media&&!window.__app.file;
  await transaction('readwrite',s=>s.put(record));await window.__app.openProject(id);return rejected&&!!window.__app.media;
 },originalID);
 check(stale,'a stale song blob is rejected instead of reopening the wrong song');

 await page.evaluate(()=>{const a=window.__app;a.project.name='Reaudit original';a.project.text='Primera frase\nSegunda frase';a.project.sync=[{t:6,wt:[6,7],wd:[.2,1.2]},{t:10}];a.project.style.caps='all';a.project.over={'0.1':{thick:.5}};a.project.clip={start:5,end:20};a.projectChanged();a.refreshAudio();a.emit('reset')});
 await page.click('#tab-export');
 let release,started;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>started=resolve);
 await page.route('**/player.js',async route=>{started();await gate;await route.continue()});
 const downloadP=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar el HTML'}).click();await requested;
 await page.evaluate(()=>{const a=window.__app;a.project.name='Later edit';a.project.text='Contenido posterior';a.project.sync=[{t:2}];a.project.clip={start:0,end:35};a.projectChanged();a.emit('reset')});
 check(await page.getByRole('button',{name:'Descargar el HTML'}).isDisabled(),'project changes cannot enable duplicate exports while a file is being built');
 release();const download=await downloadP;await download.saveAs('test/media/reaudit-export.html');await page.unroute('**/player.js');
 const html=readFileSync('test/media/reaudit-export.html','utf8'),data=readPayloadFromHtml(html);
 check(data.lines[0][1]==='Primera frase'&&data.lines[0][0]===1&&data.lines[0][3][1]===1.2&&data.sourceStart===5&&download.suggestedFilename()==='reaudit-original.html','slow export keeps one project, filename, clip and timing snapshot');

 await page.click('#tab-text');await page.locator('.text-import summary').click();
 const chooserP=page.waitForEvent('filechooser');await page.getByRole('button',{name:'HTML de Letras ASCII (.html)',exact:true}).click();
 await (await chooserP).setFiles('test/media/reaudit-export.html');
 await page.waitForFunction(()=>window.__app.project.text.startsWith('Primera'));
 check(await page.evaluate(()=>{const p=window.__app.project;return p.sync[0].t===6&&p.sync[0].wt[1]===7&&p.style.caps==='all'&&p.over['0.1'].thick===.5}),'real HTML importer restores absolute source timing and valid design controls');
 await page.getByRole('button',{name:'Deshacer cambio de letra y tiempos',exact:true}).click();
 check(await page.locator('.lyrics').inputValue()==='Contenido posterior','import undo restores the project before replacement');
 await page.getByRole('button',{name:'Quitar todas las marcas de tiempo',exact:true}).click();
 check(await page.evaluate(()=>window.__app.project.sync.length===0),'clear timing applies without removing text');
 await page.getByRole('button',{name:'Deshacer cambio de letra y tiempos',exact:true}).click();
 check(await page.evaluate(()=>window.__app.project.sync[0].t===2),'clear timing has a working undo');
 await page.getByRole('button',{name:'Quitar todas las marcas de tiempo',exact:true}).click();
 await page.locator('.lyrics').fill('Otra edición');
 check(!(await page.locator('.undo-change').isVisible()),'later edits invalidate old undo instead of overwriting newer work');
 await page.evaluate(()=>{const a=window.__app;a.project.text='Palabras de prueba';a.project.sync=[{t:1}];a.projectChanged();a.emit('reset')});
 await page.click('#tab-export');
 await page.evaluate(()=>{window.__app.file.arrayBuffer=async()=>{throw new DOMException('File no longer readable','NotReadableError')}});
 const fallbackP=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar el HTML'}).click();await(await fallbackP).saveAs('test/media/reaudit-fallback.html');
 const fallback=JSON.parse(readFileSync('test/media/reaudit-fallback.html','utf8').match(/<script id="payload" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 check(fallback.audio.kind==='wav'&&fallback.audio.mime==='audio/wav','decoded audio can still be exported when the original file handle becomes unreadable');
 await page.evaluate(()=>{delete window.__app.file.arrayBuffer});
 await page.click('#tab-style');await page.getByRole('button',{name:'Siguiente: Exportar',exact:true}).click();
 check(await page.locator('#tab-export').getAttribute('aria-selected')==='true','word refinement is truly optional in the main journey');
 await page.getByRole('button',{name:'Atrás',exact:true}).click();
 check(await page.locator('#tab-style').getAttribute('aria-selected')==='true','back returns to design after skipping optional word refinement');
 await page.click('#tab-words');await page.waitForTimeout(200);
 const beforeRedo=await page.evaluate(()=>JSON.stringify(window.__app.project.sync));
 await page.getByRole('button',{name:'Volver a marcar esta frase',exact:true}).click();
 check(await page.evaluate(()=>window.__app.panels.mark.phase==='count')&&await page.evaluate(()=>JSON.stringify(window.__app.project.sync))===beforeRedo,'word correction opens phrase capture without discarding its existing timing');
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 check(await page.evaluate(()=>JSON.stringify(window.__app.project.sync))===beforeRedo,'cancelling phrase recapture preserves every old timing');
 await page.click('#tab-words');
 await page.evaluate(()=>{const a=window.__app,w=a.panels.words;w.playOn=true;w.nudge(.02);a.selectTab('style');a.player.pause()});
 await page.waitForTimeout(600);
 check(await page.evaluate(()=>window.__app.player.state==='paused'),'a delayed word audition cannot restart audio in another tool');
 check(await page.getByRole('tabpanel').count()===1,'only one active tab panel is exposed to assistive technology');
 await page.screenshot({path:`test/audit/reaudit/09-design-${process.env.PLAYWRIGHT_BROWSER||'chromium'}.png`});

 writeFileSync('site/reaudit-recipient.html',html);
 const recipient=await context.newPage();watch(recipient,errors);
 await recipient.goto(`http://localhost:${port}/reaudit-recipient.html`);await recipient.waitForFunction(()=>document.documentElement.classList.contains('ready'));
 await recipient.getByLabel('Posición en la canción').press('End');await recipient.getByLabel('Posición en la canción').press('PageDown');
 check(await recipient.evaluate(()=>window.__player.state==='paused'&&window.__player.t>1),'recipient seeking before play leaves the intro and keeps the chosen position');
 await recipient.getByRole('button',{name:'Reproducir',exact:true}).click();await recipient.waitForTimeout(120);
 check(await recipient.evaluate(()=>window.__player.t>1),'recipient playback starts at the chosen position instead of restarting at zero');
 await recipient.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 check(await recipient.evaluate(()=>!window.__player.destroyed&&window.__player.state==='paused'),'browser back-cache does not dispose the recipient player');
 await recipient.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await recipient.getByRole('button',{name:'Reproducir',exact:true}).click();await recipient.waitForTimeout(100);
 check(await recipient.evaluate(()=>!document.getElementById('audio').paused),'recipient can play after a back-cache round trip');
 await recipient.getByRole('button',{name:'Pausar',exact:true}).click();await recipient.screenshot({path:'test/audit/reaudit/10-recipient.png'});

 mkdirSync('site/embedded',{recursive:true});for(const file of ['index.html','app.js','app.css','player.js','audio-worker.js','favicon.svg','social-card.png'])copyFileSync('site/'+file,'site/embedded/'+file);cpSync('site/fonts','site/embedded/fonts',{recursive:true});cpSync('js','site/test-source',{recursive:true});
 const embedded=await context.newPage();watch(embedded,errors);await embedded.goto(`http://localhost:${port}/embedded/index.html`);await embedded.waitForFunction(()=>document.documentElement.classList.contains('ready'));
 await embedded.setInputFiles('#songfile','test/media/kick120.wav');await embedded.waitForFunction(()=>window.__app.media&&!window.__app.loadController);
 await embedded.evaluate(()=>{const a=window.__app;a.project.text='Subruta de prueba';a.project.sync=[{t:1}];a.projectChanged();a.emit('reset')});
 await embedded.click('#tab-export');const embeddedDownloadP=embedded.waitForEvent('download');await embedded.getByRole('button',{name:'Descargar el HTML'}).click();await embeddedDownloadP;
 check(true,'worker, fonts and standalone export work from a subdirectory');
 const remounted=await embedded.evaluate(async()=>{const old=window.__app;await old.destroy();const {App}=await import('/test-source/studio.js');const app=new App(document.getElementById('app'),document.getElementById('audio'),document.getElementById('audioFull'));window.__app=app;const valid=old.scope.controller.signal.aborted&&app.root.querySelectorAll('[role=tab]').length===6;await app.destroy();return valid&&app.root.children.length===0});
 check(remounted,'public editor constructor can mount again after complete teardown');

 if((process.env.PLAYWRIGHT_BROWSER||'chromium')==='chromium')for(const name of ['reaudit-aac.mp4','reaudit-opus.webm','reaudit.mp3']){
  if(!existsSync('test/media/'+name)){console.log('codec fixture unavailable:',name);continue;}
  const mediaPage=await context.newPage();watch(mediaPage,errors);mediaPage.on('dialog',dialog=>dialog.accept());await mediaPage.goto(`http://localhost:${port}/`);await mediaPage.waitForFunction(()=>document.documentElement.classList.contains('ready'));
  await mediaPage.setInputFiles('#songfile','test/media/'+name);await mediaPage.waitForFunction(()=>window.__app.media&&!window.__app.loadController,null,{timeout:30000});
  check(await mediaPage.evaluate(name=>window.__app.file.name===name&&Math.abs(window.__app.media.dur-3)<.15,name),'native decoding: '+name);await mediaPage.close();
 }
 const fileFailure=await page.evaluate(async()=>{
  const a=window.__app,put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(record,...args){if(record.kind==='file')throw new DOMException('Simulated file quota','QuotaExceededError');return put.call(this,record,...args)};
  try {const result=await a.loadFile(a.file);return result&&!!a.media&&!a.mediaAlert.hidden}
  finally {IDBObjectStore.prototype.put=put}
 });
 check(fileFailure,'failure to save audio remains visible after metadata autosave succeeds');
 const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const phone=await touch.newPage();watch(phone,errors);
 await phone.goto(`http://localhost:${port}/`);await phone.waitForFunction(()=>document.documentElement.classList.contains('ready'));await phone.setInputFiles('#songfile','test/media/kick120.wav');await phone.waitForFunction(()=>window.__app.media&&!window.__app.loadController);
 await phone.click('#tab-text');await phone.getByLabel('Letra de la canción',{exact:true}).fill('Se conserva al cambiar el espacio visible');await phone.setViewportSize({width:390,height:400});
 await phone.getByRole('button',{name:'Siguiente: Marcar',exact:true}).click();await phone.setViewportSize({width:390,height:844});
 check(await phone.evaluate(()=>window.__app.tab==='mark'&&window.__app.project.text==='Se conserva al cambiar el espacio visible'&&document.documentElement.scrollWidth<=innerWidth),'touch text entry and a smaller viewport preserve text and allow continuing');
 await phone.screenshot({path:`test/audit/reaudit/11-phone-${process.env.PLAYWRIGHT_BROWSER||'chromium'}.png`});await touch.close();
 assert.deepEqual(errors,[]);check(true,'no page, console or HTTP failures across the re-audit journey');
 console.log(`${count} re-audit checks passed (${process.env.PLAYWRIGHT_BROWSER||'chromium'})`);
}finally{await browser.close();srv.close();}
