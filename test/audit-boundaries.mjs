import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {serve,launch,watch} from './lib.mjs';
import {newProject} from '../js/project.js';
import {encodeWav} from '../js/analyze.js';
import {readPayloadFromHtml} from '../js/import.js';
import '../scripts/fixtures.mjs';

const kind=process.env.PLAYWRIGHT_BROWSER||'chromium',phase=process.env.AUDIT_PHASE||'regression';
const folder='test/audit/integral';mkdirSync(folder,{recursive:true});
writeFileSync('test/media/audit-short.wav',Buffer.from(encodeWav([new Float32Array(17640)],44100)));
const {srv,port}=serve('site'),errors=[],failures=[],passed=[];
let browser=await launch(),context,page;
const open=async()=>{
 context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
 page=await context.newPage();watch(page,errors);page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());
 await page.goto(`http://localhost:${port}/`);await page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
 await page.setInputFiles('#songfile','test/media/kick120.wav');await page.waitForFunction(()=>window.__app.media&&!window.__app.loadController);
};
const check=async(name,run)=>{
 try{
  // WPE owns a native media process. Isolate cases instead of accumulating source reloads in one process.
  if(kind==='webkit'){if(context){await context.close();await browser.close();browser=await launch()}await open()}
  await run();passed.push(name);console.log('ok',name);
 }
 catch(error){
  const diagnostic=await page.evaluate(()=>{const a=window.__app;return{state:a?.player.state,playError:a?.player.lastPlayError,ready:a?.audio.readyState,mediaError:a?.audio.error?.message,clip:a?.project.clip,duration:a?.player.dur,tab:a?.tab}}).catch(()=>null);
  failures.push({name,error:error.message,diagnostic});console.error('FAIL',name,error.message,JSON.stringify(diagnostic));await page.screenshot({path:`${folder}/${phase}-${kind}-${name}.png`}).catch(()=>{});
 }
};
const fixture=async(tab='words')=>{
 await page.evaluate(({p,tab})=>{const a=window.__app;a.closeProjects?.();if(a.theaterOn)a.closeTheater();a.player.pause();a.project={...p,song:a.project.song};a.projectChanged();a.refreshAudio();a.emit('reset');a.selectTab('words');a.panels.words.select(0,1,{play:false});a.panels.words.audition.loop=false;a.selectTab(tab);a.history.reset();},{tab,p:{...newProject(),text:'Luna junto a ti\nSiempre música',sync:[{t:13,wt:[13,14,15,16],wd:[.2,.2,.2,.4]},{t:20,wt:[20,21],wd:[.2,.4]}],clip:{start:12,end:30}}});
};
const sync=()=>page.evaluate(()=>structuredClone(window.__app.project.sync));
try{
 if(kind!=='webkit')await open();

 await check('keyboard-tab-navigation',async()=>{
  await fixture('style');const before=await sync();await page.locator('#tab-style').press('ArrowLeft');
  assert.equal(await page.evaluate(()=>window.__app.tab),'words');assert.deepEqual(await sync(),before);
 });
 await check('modal-keyboard-isolation',async()=>{
  await fixture();await page.getByRole('button',{name:'Mis proyectos',exact:true}).click();await page.waitForSelector('[role=dialog][aria-label="Mis proyectos"]');
  const before=await sync();await page.getByRole('button',{name:'Cerrar',exact:true}).press('ArrowRight');assert.deepEqual(await sync(),before);
 });
 await check('modal-undo-isolation',async()=>{
  await fixture();await page.evaluate(()=>window.__app.panels.words.nudge(.02));const before=await sync();
  await page.getByRole('button',{name:'Mis proyectos',exact:true}).click();await page.waitForSelector('[role=dialog][aria-label="Mis proyectos"]');
  await page.getByRole('button',{name:'Cerrar',exact:true}).press('Control+z');assert.deepEqual(await sync(),before);
 });
 await check('modal-fullscreen-isolation',async()=>{
  await fixture();await page.getByRole('button',{name:'Mis proyectos',exact:true}).click();await page.waitForSelector('[role=dialog][aria-label="Mis proyectos"]');
  await page.getByRole('button',{name:'Cerrar',exact:true}).press('f');assert.equal(await page.evaluate(()=>window.__app.theaterOn),false);
 });
 await check('held-keyboard-undo',async()=>{
  await fixture();const before=await sync();await page.locator('.sb[data-src="0"][data-k="1"]').focus();
  await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');await page.keyboard.up('ArrowRight');
  assert.equal(await page.evaluate(()=>window.__app.history.past.length),1);await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.deepEqual(await sync(),before);
 });
 await check('wave-cancel-restores-clip',async()=>{
  await fixture('song');await page.evaluate(()=>window.__app.setClip(5,15));
  const wave=page.getByRole('img',{name:'Onda de la canción con el tramo elegido',exact:true});await wave.scrollIntoViewIfNeeded();
  const point=await wave.evaluate(cv=>{const w=window.__app.panels.song.wave,r=cv.getBoundingClientRect();cv.addEventListener('pointerdown',e=>window.__auditPointerId=e.pointerId,{once:true});return{x:r.x+w.tx(5),y:r.y+25}});
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+60,point.y,{steps:6});
  await wave.evaluate(cv=>cv.releasePointerCapture(window.__auditPointerId));await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>window.__app.project.clip),{start:5,end:15});
 });
 await check('precise-short-clip-fields',async()=>{
  await fixture('song');await page.evaluate(()=>window.__app.setClip(10.2,20));
  const end=page.getByRole('textbox',{name:'Termina en',exact:true});await end.fill('0:11.4');await end.press('Tab');
  assert.deepEqual(await page.evaluate(()=>window.__app.project.clip),{start:10.2,end:11.4});
 });
 await check('clip-edit-immediate-play-uses-new-audio',async()=>{
  for(const name of ['Reproducir','▶ Probar este tramo']){
   await fixture('song');const end=page.getByRole('textbox',{name:'Termina en',exact:true});await end.fill('0:15.00');await end.press('Tab');
   await page.getByRole('button',{name,exact:true}).click();await page.waitForFunction(()=>window.__app.player.state==='playing'&&!window.__app.audio.paused);
   assert.equal(await page.evaluate(()=>window.__app.player.dur),3);await page.waitForTimeout(400);
   assert.ok(await page.evaluate(()=>window.__app.player.state==='playing'&&!window.__app.audio.paused&&window.__app.player.dur===3));
  }
 });
 await check('clip-edit-countdown-keeps-its-gesture',async()=>{
  await fixture('song');await page.evaluate(()=>{const a=window.__app;a.project.sync=[];a.emit('reset')});
  const end=page.getByRole('textbox',{name:'Termina en',exact:true});await end.fill('0:15.00');await end.press('Tab');await page.locator('#tab-mark').click();
  await page.locator('.mcard.idle .primary').click();assert.equal(await page.evaluate(()=>window.__app.player.dur),3);
  await page.waitForFunction(()=>window.__app.panels.mark.phase==='run'&&!window.__app.audio.paused);assert.equal(await page.evaluate(()=>window.__app.player.dur),3);
 });
 await check('rapid-word-numeric-correction',async()=>{
  await fixture();await page.evaluate(()=>{const a=window.__app;a.project.text='Una voz';a.project.clip={start:0,end:3};a.project.offset=0;a.project.sync=[{t:1,wt:[1,1.1],wd:[.05,.05]}];a.projectChanged();a.refreshAudio();a.emit('reset');a.panels.words.show();a.panels.words.select(0,0,{play:false})});
  const input=page.getByRole('spinbutton',{name:'Inicio de palabra en segundos de canción',exact:true});await input.fill('1.04');await input.press('Tab');
  assert.deepEqual((await sync())[0].wt,[1.04,1.1]);assert.deepEqual(await page.evaluate(()=>window.__app.panels.words.timeline().lines[0].words.map(w=>w.onset)),[1.04,1.1]);
  assert.equal(await page.evaluate(()=>window.__app.panels.words.strip.words.find(w=>w.src===0&&w.k===0).len),.05,'the strip must show the same 50 ms duration as the numeric field');
 });
 await check('timeline-drag-reaches-both-clip-edges',async()=>{
  await fixture();await page.evaluate(()=>{const a=window.__app;a.project.text='Una voz';a.project.clip={start:0,end:2};a.project.offset=0;a.project.sync=[{t:.4,wt:[.4,1.8],wd:[.05,.05]}];a.projectChanged();a.refreshAudio();a.emit('reset');a.panels.words.show()});
  await page.getByRole('button',{name:'Ver todo el tramo',exact:true}).click();
  for(const [k,target,expected]of [[0,-.1,0],[1,2.1,1.95]]){
   const block=page.locator(`.sb[data-src="0"][data-k="${k}"]`);await block.scrollIntoViewIfNeeded();
   const point=await block.evaluate((el,target)=>{const s=window.__app.panels.words.strip,r=el.getBoundingClientRect(),on=s.words.find(w=>w.k===+el.dataset.k).on;return{x:r.x+2,y:r.y+r.height/2,dx:s.tx(target)-s.tx(on)}},target);
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+point.dx,point.y,{steps:8});await page.mouse.up();
   assert.equal((await sync())[0].wt[k],expected);
  }
 });
 await check('transport-restart-clears-audition',async()=>{
  await fixture();await page.getByRole('button',{name:'Bucle A–B',exact:true}).click();await page.getByRole('button',{name:'Escuchar palabra',exact:true}).click();
  await page.waitForFunction(()=>window.__app.player.state==='playing'&&!window.__app.audio.paused);
  await page.getByRole('button',{name:'Volver al inicio del tramo',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__app.player.auditionRange),null);assert.ok(await page.evaluate(()=>window.__app.player.t<.3));
 });
 await check('audition-at-natural-end',async()=>{
  await fixture();await page.evaluate(()=>{const a=window.__app;a.project.clip={start:12,end:14};a.project.offset=0;a.project.text='Final';a.project.sync=[{t:13.8,wt:[13.8],wd:[.15]}];a.projectChanged();a.refreshAudio();a.emit('reset');a.panels.words.show()});
  await page.getByRole('button',{name:'Bucle A–B',exact:true}).click();await page.getByRole('button',{name:'Escuchar palabra',exact:true}).click();
  await page.waitForFunction(()=>!window.__app.audio.paused);await page.waitForTimeout(1700);
  assert.ok(await page.evaluate(()=>window.__app.player.state==='playing'&&!window.__app.audio.paused&&window.__app.audio.volume>.98));
 });
 await check('playback-speed-consistency',async()=>{
  await fixture();await page.selectOption('[aria-label="Velocidad para corregir"]','.5');
  const more=page.locator('.moreBtn');if(await more.isVisible()&&await more.getAttribute('aria-expanded')==='false')await more.click();
  await page.getByRole('combobox',{name:'Velocidad',exact:true}).selectOption('0.75');
  assert.equal(await page.locator('[aria-label="Velocidad para corregir"]').inputValue(),'.75');
 });
 await check('variation-controls-consistency',async()=>{
  await fixture('style');await page.getByRole('button',{name:'Sutil',exact:true}).click();
  assert.equal(await page.locator('[aria-label="Qué tan al azar cambian letras y animaciones"]').inputValue(),'0.15');
 });
 await check('real-beat-count',async()=>{
  await fixture('song');const end=page.getByRole('textbox',{name:'Termina en',exact:true});await end.fill('0:25.00');await end.press('Tab');await page.locator('#tab-style').click();
  const result=await page.evaluate(()=>{const a=window.__app,e=a.media.energy,c=a.clip();return{hits:[...e.hit.slice(Math.floor(c.start*e.fps),Math.ceil(c.end*e.fps))].filter(Boolean).length,stats:a.panels.style.stats.textContent}});
  assert.ok(result.hits>0);assert.ok(result.stats.startsWith(`${result.hits} golpes`),JSON.stringify(result));
 });
 await check('manual-effects-keyboard-state',async()=>{
  await fixture();assert.equal(await page.getByRole('button',{name:'Brillo',exact:true}).isDisabled(),true);
  await page.getByRole('checkbox',{name:'Elegir efectos a mano',exact:true}).check();assert.equal(await page.getByRole('button',{name:'Brillo',exact:true}).isDisabled(),false);
 });
 await check('word-color-accessible-state',async()=>{
  await fixture();await page.getByRole('button',{name:'Rubí',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Rubí',exact:true}).getAttribute('aria-pressed'),'true');
 });
 await check('karaoke-long-token-pages',async()=>{
  await fixture('style');
  const result=await page.evaluate(()=>{const a=window.__app;a.project.text='pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4)+' fin';a.project.clip={start:0,end:10};a.project.offset=0;a.project.sync=[{t:1,wt:[1,6],wd:[4,.3]}];Object.assign(a.project.style,{mainMode:'normal',mainFace:'round',karaokeMode:'normal',karaokeSize:2});a.projectChanged();a.rebuild();const s=a.scene,l=s.textLayer,pages=l.karaoke[0].pages,seen=new Set();for(let t=1.01;t<5;t+=.04){s.render(t,'song');seen.add(pages.indexOf(l.visibleKaraoke.page))}return{pages:pages.length,seen:seen.size}});
  assert.ok(result.pages>1);assert.equal(result.seen,result.pages,JSON.stringify(result));
 });
 await check('unicode-ascii-glyphs',async()=>{
  await fixture('style');
  const result=await page.evaluate(()=>{const a=window.__app;a.project.text='🎵 tú 👩‍🚀';a.project.offset=0;a.project.clip={start:0,end:10};a.project.sync=[{t:1,wt:[1,2,3],wd:[.3,.3,.3]}];a.project.style.mainMode='ascii';a.projectChanged();a.rebuild();return a.scene.tl.lines[0].words.map(w=>({text:w.text,glyphs:w.letters.map(l=>l.ch)}))});
  assert.deepEqual(result[0].glyphs,['🎵']);assert.deepEqual(result[2].glyphs,['👩‍🚀']);
 });
 await check('normal-long-word-within-canvas',async()=>{
  await fixture('style');const bounds=await page.evaluate(()=>{const a=window.__app;a.project.text='Extraordinariamente'.repeat(12);a.project.clip={start:0,end:10};a.project.sync=[{t:1}];Object.assign(a.project.style,{mainMode:'normal',mainFace:'round'});a.projectChanged();a.rebuild();const s=a.scene,item=s.textLayer.hero[0],m=document.createElement('canvas').getContext('2d');m.font=`800 ${item.size}px Nunito`;const width=m.measureText(item.text).width;return{left:item.x-width/2,right:item.x+width/2,canvas:s.r.W}});
  assert.ok(bounds.left>=0&&bounds.right<=bounds.canvas,JSON.stringify(bounds));
 });
 await check('dynamic-reduced-motion-stops-demo',async()=>{
  try{
   await fixture('style');await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>{const a=window.__app;a.project.text='';a.project.sync=[];a.projectChanged();a.rebuild()});
   await page.waitForFunction(()=>window.__app.player.demo);await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>window.__app.scene.motionQuery.matches);assert.equal(await page.evaluate(()=>window.__app.player.demo),false);
  }finally{await page.emulateMedia({reducedMotion:'no-preference'});}
 });
 await check('invalid-import-offset-preserves-work',async()=>{
  await fixture('text');await page.locator('.text-import summary').click();await page.locator('#startat').fill('1::2');const before=await page.evaluate(()=>JSON.stringify(window.__app.project));
  writeFileSync('test/media/audit-precise.lrc','[00:13.155]<00:13.155>Luz <00:13.255>azul');
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Letra con tiempos (.lrc .srt .vtt)',exact:true}).click();await(await chooser).setFiles('test/media/audit-precise.lrc');
  await page.waitForFunction(()=>window.__app.panels.text.undoChange||document.querySelector('.toast.show')?.textContent.includes('inicio del archivo'));
  try{assert.equal(await page.evaluate(()=>JSON.stringify(window.__app.project)),before);}finally{await page.locator('#startat').fill('');}
 });
 const importTimedFile=async(file)=>{
  const details=page.locator('.text-import');if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Letra con tiempos (.lrc .srt .vtt)',exact:true}).click();await(await chooser).setFiles(file);
 };
 await check('obsolete-lyric-import-cannot-replace-newer-work',async()=>{
  await fixture('text');writeFileSync('test/media/audit-old.lrc','[00:01.000]Antigua');writeFileSync('test/media/audit-new.lrc','[00:02.000]Nueva');
  await page.evaluate(()=>{window.__auditFileReader=window.FileReader;window.FileReader=class extends window.__auditFileReader{readAsText(file){if(file.name==='audit-old.lrc'){window.__auditOldReader=this;window.__auditReleaseReader=()=>super.readAsText(file)}else super.readAsText(file)}}});
  try{
   await importTimedFile('test/media/audit-old.lrc');await page.waitForFunction(()=>window.__auditReleaseReader);
   await importTimedFile('test/media/audit-new.lrc');await page.waitForFunction(()=>window.__app.project.text==='Nueva'&&!window.__app.panels.text.importController);
   assert.equal(await page.evaluate(()=>window.__auditOldReader.onload),null);await page.evaluate(()=>window.__auditReleaseReader());await page.waitForFunction(()=>window.__auditOldReader.readyState===FileReader.DONE);
   assert.equal(await page.evaluate(()=>window.__app.project.text),'Nueva');assert.equal(await page.locator('body > input[type=file]').count(),0);
  }finally{await page.evaluate(()=>{window.FileReader=window.__auditFileReader;window.__app.panels.text.cancelImport()});}
 });
 await check('synchronous-file-reader-failure-cleans-up',async()=>{
  await fixture('text');const before=await page.evaluate(()=>JSON.stringify(window.__app.project));
  await page.evaluate(()=>{window.__auditReadAsText=FileReader.prototype.readAsText;FileReader.prototype.readAsText=()=>{throw Error('injected reader failure')}});
  try{
   await importTimedFile('test/media/audit-precise.lrc');await page.waitForFunction(()=>!window.__app.panels.text.importController&&document.querySelector('.toast.show')?.textContent.includes('leer ese archivo'));
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__app.project)),before);assert.equal(await page.locator('body > input[type=file]').count(),0);
  }finally{await page.evaluate(()=>{FileReader.prototype.readAsText=window.__auditReadAsText;window.__app.panels.text.cancelImport()});}
 });
 await check('oversized-lyric-import-preserves-project',async()=>{
  await fixture('text');const before=await page.evaluate(()=>JSON.stringify(window.__app.project));writeFileSync('test/media/audit-large.lrc','[00:01.000]'+'a'.repeat(100001));
  await importTimedFile('test/media/audit-large.lrc');await page.waitForFunction(()=>!window.__app.panels.text.importController&&document.querySelector('.toast.show')?.textContent.includes('límite'));
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__app.project)),before);
 });
 await check('no-lyrics-after-clip-ended',async()=>{
  await fixture('style');const difference=await page.evaluate(()=>{const a=window.__app;a.project.text='Dentro Futuro';a.project.offset=0;a.project.clip={start:0,end:3};a.project.sync=[{t:1,wt:[1,4],wd:[.3,.3]}];a.project.style.mainMode='normal';a.projectChanged();a.rebuild();const s=a.scene,ctx=s.r.ctx;s.render(4.2,'ended');const before=ctx.getImageData(0,0,s.r.cv.width,s.r.cv.height).data;const hero=s.textLayer.hero;s.textLayer.hero=[];s.render(4.2,'ended');const after=ctx.getImageData(0,0,s.r.cv.width,s.r.cv.height).data;s.textLayer.hero=hero;let diff=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>20)diff++;return diff});
  assert.equal(difference,0);
 });
 await check('short-audio-preserves-work',async()=>{
  await fixture('song');const before=await page.evaluate(()=>JSON.stringify(window.__app.project));
  await page.setInputFiles('#songfile','test/media/audit-short.wav');await page.waitForFunction(()=>!window.__app.loadController);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__app.project)),before);
 });
 // Restore the synthetic song if the old version accepted the invalid replacement.
 if(await page.evaluate(()=>window.__app.media.dur<1)){await page.setInputFiles('#songfile','test/media/kick120.wav');await page.waitForFunction(()=>!window.__app.loadController);}
 await check('recipient-transcript-matches-clip',async()=>{
  await fixture('export');await page.evaluate(()=>{const a=window.__app;a.project.text='Dentro\nSin marca\nFuera';a.project.sync=[{t:1},null,{t:20}];a.project.offset=0;a.project.clip={start:0,end:5};a.projectChanged();a.refreshAudio();a.emit('reset')});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar el HTML',exact:true}).click();await(await download).saveAs('test/media/audit-export.html');
  const html=readFileSync('test/media/audit-export.html','utf8');assert.equal(readPayloadFromHtml(html).lines.length,3,'round trip retains the complete project');
  const recipient=await context.newPage();watch(recipient,errors);try{await recipient.setContent(html);await recipient.waitForFunction(()=>window.__player);const text=await recipient.locator('.player-transcript').textContent();assert.ok(text.includes('Dentro')&&!text.includes('Sin marca')&&!text.includes('Fuera'),text);}finally{await recipient.close();}
 });
 await check('destroy-stops-before-storage-finishes',async()=>{
  await fixture();await page.evaluate(()=>window.__app.persistence.flush());await page.getByRole('button',{name:'Reproducir',exact:true}).click();await page.waitForFunction(()=>!window.__app.audio.paused);
  const immediate=await page.evaluate(()=>{const a=window.__app,write=a.persistence.write;let release;const gate=new Promise(resolve=>release=resolve);window.__auditRelease=release;a.persistence.write=async(...args)=>{await gate;return write(...args)};a.projectChanged();window.__auditDestroy=a.destroy();return{paused:a.audio.paused,playerDisposed:!!a.player.destroyed}});
  try{assert.deepEqual(immediate,{paused:true,playerDisposed:true});}finally{await page.evaluate(async()=>{window.__auditRelease();await window.__auditDestroy});}
 });
 assert.deepEqual(errors,[]);console.log(`${passed.length} audit boundary cases passed (${kind})`);
}finally{
 writeFileSync(`${folder}/${phase}-${kind}-results.json`,JSON.stringify({passed,failures,errors},null,2)+'\n');
 await page.evaluate(()=>window.__app?.destroy()).catch(()=>{});await browser.close();srv.close();
}
assert.deepEqual(failures,[]);
