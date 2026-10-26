import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,copyFileSync} from 'node:fs';
import {serve,launch,watch} from './lib.mjs';
import {readPayloadFromHtml} from '../js/import.js';
import '../scripts/fixtures.mjs';
mkdirSync('test/audit/timeline',{recursive:true});
const {srv,port}=serve('site'),browser=await launch(),errors=[];let checks=0;
const check=(value,message)=>{assert.ok(value,message);console.log('ok',++checks,message)};
try{
 const context=await browser.newContext({viewport:{width:390,height:700},hasTouch:true,isMobile:true,acceptDownloads:true});
 const page=await context.newPage();watch(page,errors);page.on('dialog',dialog=>dialog.accept());
 await page.goto(`http://localhost:${port}/`);await page.waitForFunction(()=>window.__app);
 await page.setInputFiles('#songfile','test/media/kick120.wav');await page.waitForFunction(()=>window.__app.media&&!window.__app.loadController);
 await page.evaluate(()=>{const a=window.__app;a.project.text='Sol y música aquí\nUna frase con acentos canción corazón ñ ¿y tú? '.repeat(3).trim();const ph=a.project.text.split('\n');a.project.sync=ph.map((text,i)=>{const words=text.split(/\s+/);const wt=words.map((_,k)=>13+i*4+k*.15);return{t:wt[0],wt,wd:words.map(()=>.1)}});a.project.sync[0]={t:13,wt:[13,13.1,13.25,13.45],wd:[.05,.1,.1,.2]};a.project.clip={start:12,end:35};a.project.offset=-.12;a.project.over={'0.1':{entryMs:0,fx:'instant',face:'roman',col:'mint'}};a.refreshAudio();a.projectChanged();a.emit('reset');a.selectTab('style')});
 await page.evaluate(()=>{window.__app.project.sync[1].wt[1]=17.155;window.__app.projectChanged()});
 await page.waitForTimeout(250);
 for(const focus of ['word','line'])for(const main of ['ascii','normal'])for(const karaoke of ['ascii','normal']){
  const result=await page.evaluate(({focus,main,karaoke})=>{
   const a=window.__app,s=a.scene;Object.assign(a.project.style,{focus,mainMode:main,karaokeMode:karaoke,karaokeFace:'hand'});a.rebuild();a.player.pause();
   const containers=focus==='word'?s.tl.units:s.tl.lines,out=[];
   for(const word of s.tl.lines[0].words){
    const container=containers.find(l=>l.words.includes(word)),t=word.onset+word.visualWindow*.65;
    s.render(t,'song');const shown=s.r.ctx.getImageData(0,0,s.r.cv.width,s.r.cv.height).data;
    const saved=s.textLayer.hero;const mode=word.renderMode;
    if(main==='normal')s.textLayer.hero=saved.filter(h=>h.w!==word);else word.renderMode='normal';
    s.render(t,'song');const hidden=s.r.ctx.getImageData(0,0,s.r.cv.width,s.r.cv.height).data;
    let diff=0;for(let i=0;i<shown.length;i+=4)if(Math.abs(shown[i]-hidden[i])+Math.abs(shown[i+1]-hidden[i+1])+Math.abs(shown[i+2]-hidden[i+2])>20)diff++;
    s.textLayer.hero=saved;word.renderMode=mode;
    out.push({text:word.text,diff,entry:word.appearDur,window:word.visualWindow,visible:t<container.exitStart});
   }
   s.render(1.2,'song');return{out,hero:s.textLayer.hero.length,mode:s.tl.style.karaokeMode};
  },{focus,main,karaoke});
  check(result.out.every(w=>w.diff>5&&w.entry<=w.window*.25&&w.visible),`${focus} ${main}/${karaoke}: all four 100–200 ms words produce visible pixels after fully entering`);
 }
 await page.evaluate(()=>{const a=window.__app;Object.assign(a.project.style,{focus:'word',mainMode:'normal',karaokeMode:'normal',karaokeFace:'hand',entryFx:'quick',entryMs:80});a.projectChanged();a.rebuild()});
 for(const [width,height]of [[320,568],[360,640],[390,700],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>window.__app.scene.resize());
  const geometry=await page.evaluate(()=>{const s=window.__app.scene,l=s.textLayer;s.render(s.tl.lines[1].words[5].onset+.03,'song');return{width:s.r.W,band:l.band,pages:l.karaoke.map(i=>i.pages.length),all:l.karaoke.every(({line,pages})=>pages.flat().map(w=>w.text).join('')===line.words.map(w=>w.text).join('')),inside:l.karaoke.every(({pages})=>pages.flat().every(w=>w.x>=0&&w.x+w.width<=s.r.W+1&&w.y+w.size<=l.band.y+l.band.h+1)),ball:l.ball,visible:l.visibleKaraoke?.page.map(w=>({k:w.k,x:w.x,w:w.width,y:w.y})),active:l.visibleKaraoke?.active}});
  check(geometry.all&&geometry.inside,`${width}×${height}: segmented karaoke retains every character inside its band`);
  const active=geometry.visible?.find(w=>w.k===geometry.active);
  check(active&&geometry.ball&&geometry.ball.x>=active.x&&geometry.ball.x<=active.x+active.w&&geometry.ball.y<active.y,`${width}×${height}: the ball follows measured text geometry`);
 }
 for(const face of ['round','serif','script','tall','hand','wide','roman']){
  const valid=await page.evaluate(face=>{const a=window.__app,s=a.scene;Object.assign(a.project.style,{karaokeFace:face,karaokeSize:1.3,karaokeDetail:1.2});a.rebuild();const t=s.tl.lines[1].words[5].onset+.03;s.render(t,'song');const l=s.textLayer,current=l.visibleKaraoke.page.find(w=>w.k===l.visibleKaraoke.active);return current&&l.ball&&l.ball.x>=current.x&&l.ball.x<=current.x+current.width&&l.karaoke.every(({pages})=>pages.flat().every(w=>w.x>=0&&w.x+w.width<=s.r.W+1))},face);
  check(valid,`${face}: changing font and size recalculates wrapping and ball geometry`);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>window.__app.scene.motionQuery.matches);
 const still=await page.evaluate(()=>{const s=window.__app.scene,w=s.tl.lines[0].words[1];s.render(w.onset+.02,'song');const a={...s.textLayer.ball};s.render(w.onset+.04,'song');return s.R.reduced&&JSON.stringify(a)===JSON.stringify(s.textLayer.ball)});
 check(still,'reduced motion keeps normal karaoke and its ball still');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForFunction(()=>!window.__app.scene.motionQuery.matches);
 await page.evaluate(()=>{const a=window.__app;Object.assign(a.project.style,{karaokeFace:'hand',karaokeSize:1,karaokeDetail:1});a.projectChanged();a.rebuild()});
 await page.setViewportSize({width:390,height:700});
 await page.getByRole('button',{name:'Ver en pantalla completa',exact:true}).click();
 await page.evaluate(()=>{const a=window.__app;a.player.pause();a.player.seek(1.18)});await page.waitForTimeout(250);
 await page.screenshot({path:'test/audit/timeline/after-karaoke-phone.png'});
 await page.getByRole('button',{name:'Cerrar pantalla completa',exact:true}).click();
 await page.locator('#tab-export').click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar el HTML',exact:true}).click();await(await download).saveAs('test/media/reading-export.html');
 const html=readFileSync('test/media/reading-export.html','utf8'),payload=readPayloadFromHtml(html);
 check(payload.sourceStart===12&&payload.project.style.mainMode==='normal'&&payload.project.style.karaokeMode==='normal'&&payload.project.over['0.1'].entryMs===0,'real HTML preserves new style fields, zero override and sourceStart');
 copyFileSync('test/media/reading-export.html','site/reading-export.html');
 const recipient=await context.newPage();watch(recipient,errors);const external=[];
 await recipient.route('**/*',route=>{const url=route.request().url();if(url.startsWith(`http://localhost:${port}/`)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();external.push(url);return route.abort()});
 await recipient.goto(`http://localhost:${port}/reading-export.html`);await recipient.waitForFunction(()=>window.__player);
 await recipient.getByRole('button',{name:'Reproducir',exact:true}).click();await recipient.waitForFunction(()=>!window.__player.audio.paused);
 await recipient.getByRole('button',{name:'Pausar',exact:true}).click();await recipient.evaluate(()=>{window.__player.seek(1.18);window.__scene.render(1.18,'song')});
 await recipient.waitForTimeout(300);
 const standalone=await recipient.evaluate(()=>{const s=window.__scene;return{normal:s.textLayer.hero.length,zero:s.tl.lines[0].words[1].appearDur,inset:s.bottomInset||0,band:s.textLayer.band,height:s.r.H,controls:!!document.querySelector('.recipient-controls'),ball:s.textLayer.ball}});
 check(standalone.normal>0&&standalone.zero===0&&standalone.inset===0&&!standalone.controls&&standalone.band.y+standalone.band.h<=standalone.height,'standalone artwork uses the full canvas without a controls panel');assert.deepEqual(external,[]);
 await recipient.screenshot({path:'test/audit/timeline/exported-karaoke-phone.png'});
 await recipient.close();
 await page.locator('#tab-text').click();await page.locator('.text-import summary').click();
 await page.evaluate(()=>{const a=window.__app;a.project.style.mainMode='ascii';a.project.over['0.1'].entryMs=50;a.project.sync[0].wt[0]=13.5;a.project.sync[0].t=13.5;a.projectChanged()});
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'HTML de Letras ASCII (.html)',exact:true}).click();await(await chooser).setFiles('test/media/reading-export.html');
 await page.waitForFunction(()=>window.__app.project.style.mainMode==='normal'&&window.__app.project.sync[0].wt[0]===13);
 check(await page.evaluate(()=>window.__app.project.over['0.1'].entryMs===0&&window.__app.project.style.karaokeFace==='hand'&&window.__app.project.sync[1].wt[1]===17.155),'real reimport restores new modes, fonts and millisecond song timing');
 await page.evaluate(()=>window.__app.save());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__app?.media&&!window.__app.loadController);
 check(await page.evaluate(()=>window.__app.project.style.mainMode==='normal'&&window.__app.project.over['0.1'].entryMs===0),'reload restores new settings and media from IndexedDB');
 await context.close();assert.deepEqual(errors,[]);console.log(`${checks} reading and export checks passed`);
}catch(error){
 if(process.env.GITHUB_ACTIONS)console.error('::error::'+String(error.stack||error).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
 throw error;
}finally{await browser.close();srv.close()}
