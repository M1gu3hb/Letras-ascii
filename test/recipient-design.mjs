import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {serve,launch,watch} from './lib.mjs';
import '../scripts/fixtures.mjs';
const folder='test/audit/recipient-design',kind=process.env.PLAYWRIGHT_BROWSER||'chromium';mkdirSync(folder,{recursive:true});
const {srv,port}=serve('site'),browser=await launch(),errors=[];let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;console.log('ok',message)};
try{
 const editor=await browser.newPage({acceptDownloads:true});watch(editor,errors);await editor.goto(`http://localhost:${port}`);await editor.waitForFunction(()=>document.documentElement.classList.contains('ready'));
 await editor.setInputFiles('#songfile','test/media/kick120.wav');await editor.waitForFunction(()=>window.__app.media&&!window.__app.loadController);
 await editor.evaluate(()=>{const a=window.__app;a.project.text='Luz contigo\nSiempre cerca';a.project.intro='para ti';a.project.outro='con cariño';a.project.sync=[{t:1},{t:4}];a.project.style.karaokeMode='normal';a.projectChanged();a.emit('reset');a.selectTab('export')});
 const downloading=editor.waitForEvent('download');await editor.getByRole('button',{name:'Descargar el HTML',exact:true}).click();await(await downloading).saveAs('test/media/recipient-design.html');
 const html=readFileSync('test/media/recipient-design.html','utf8');writeFileSync('site/recipient-design.html',html);
 check(!html.includes('recipient-controls'),'the downloaded HTML contains no controls-panel markup or styles');
 const opening=editor.waitForEvent('popup');await editor.getByRole('button',{name:'Vista del destinatario',exact:true}).click();const preview=await opening;await preview.waitForFunction(()=>window.__player);
 const previewHtml=await editor.evaluate(url=>fetch(url).then(response=>response.text()),preview.url());check(previewHtml===html,'recipient preview and downloaded HTML are exactly the same document');
 check(await preview.getByRole('slider').count()===0&&await preview.locator('.recipient-controls').count()===0,'recipient preview also has no timeline or panel');await preview.close();await editor.close();
 for(const [name,width,height,touch]of [['phone',390,700,true],['landscape',844,390,true],['desktop',1440,900,false]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch}),page=await context.newPage();watch(page,errors);await page.goto(`http://localhost:${port}/recipient-design.html`);await page.waitForFunction(()=>document.documentElement.classList.contains('ready'));await page.bringToFront();await page.waitForFunction(()=>document.hasFocus());
  check(await page.getByRole('slider').count()===0&&await page.locator('input,details,.recipient-controls').count()===0,`${name}: no timeline, drawer or control box`);
  check(await page.evaluate(()=>window.__player.state==='intro'&&window.__scene.overlays&&window.__scene.hint&&window.__scene.intro.words.length>0&&!window.__scene.bottomInset),`${name}: the original heart, phrase and discreet start hint have the full canvas`);
  const canvas=page.getByRole('button',{name:'Reproducir',exact:true});const box=await canvas.boundingBox();check(Math.abs(box.width-width)<2&&Math.abs(box.height-height)<2,`${name}: artwork fills the viewport`);
  await page.waitForTimeout(1800);await page.screenshot({path:`${folder}/intro-${name}-${kind}.png`});
  const activate=locator=>touch?locator.tap():locator.click();
  await activate(canvas);await page.waitForFunction(()=>!window.__player.audio.paused&&window.__player.audio.currentTime>.05);await activate(page.getByRole('button',{name:'Pausar',exact:true}));
  check(await page.evaluate(()=>window.__player.state==='paused'&&window.__player.audio.paused),`${name}: touching the artwork starts and pauses real audio`);
  for(const mode of ['normal','ascii']){
   const result=await page.evaluate(mode=>{const s=window.__scene,model=s.tl.style;model.karaokeMode=mode;s.textLayer.layout();const t=s.tl.lines[0].words[0].onset+.02,cv=document.createElement('canvas');cv.width=s.r.W;cv.height=s.r.H;const ctx=cv.getContext('2d');ctx.fillStyle='#12663a';ctx.fillRect(0,0,cv.width,cv.height);s.textLayer.drawKaraoke(ctx,t);const b=s.textLayer.band,current=s.textLayer.visibleKaraoke.page.find(w=>w.k===s.textLayer.visibleKaraoke.active);return{pixel:[...ctx.getImageData(Math.ceil(b.x)+1,Math.ceil(b.y)+1,1,1).data],ball:s.textLayer.ball,current:current&&{x:current.x,y:current.y,width:current.width}}},mode);
   check(JSON.stringify(result.pixel)==='[18,102,58,255]',`${name} ${mode}: karaoke leaves its background transparent`);
   check(result.ball&&result.current&&result.ball.x>=result.current.x&&result.ball.x<=result.current.x+result.current.width&&result.ball.y<result.current.y,`${name} ${mode}: the original ball still follows its word`);
  }
  await page.getByRole('button',{name:'Reproducir',exact:true}).press('Enter');await page.waitForFunction(()=>!window.__player.audio.paused);await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
  check(await page.evaluate(()=>window.__player.state==='paused'),'holding Space does not toggle repeatedly');
  await page.evaluate(()=>{const p=window.__player;p.seek(1.2);p.scene.render(1.2,'song')});await page.screenshot({path:`${folder}/karaoke-${name}-${kind}.png`});
  await page.evaluate(()=>window.__player.finish());await activate(page.getByRole('button',{name:'Volver a reproducir',exact:true}));await page.waitForFunction(()=>!window.__player.audio.paused&&window.__player.audio.currentTime>.05);
  check(await page.evaluate(()=>window.__player.t<1),`${name}: touching the final artwork replays from the start`);await context.close();
 }
 assert.deepEqual(errors,[]);console.log(`${checks} recipient design checks passed (${kind})`);
}finally{await browser.close();srv.close()}
