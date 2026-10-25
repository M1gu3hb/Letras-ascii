import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {serve,launch,watch} from './lib.mjs';
import '../scripts/fixtures.mjs';
mkdirSync('test/audit/timeline',{recursive:true});
const {srv,port}=serve('site'),browser=await launch(),errors=[];let checks=0;
const check=(value,message)=>{assert.ok(value,message);console.log('ok',++checks,message)};
try{
 for(const [width,height] of [[320,568],[360,640],[390,700],[430,932],[844,390],[768,1024],[1024,768],[1366,768],[1440,900]]){
  const touch=width<=1024,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const page=await context.newPage();watch(page,errors);page.setDefaultTimeout(12000);
  await page.goto(`http://localhost:${port}/`);await page.waitForFunction(()=>window.__app);
  await page.setInputFiles('#songfile','test/media/kick120.wav');await page.waitForFunction(()=>window.__app.media&&!window.__app.loadController);
  await page.evaluate(()=>{const a=window.__app;a.project.text='Luna junto a ti\nSiempre música';a.project.sync=[{t:13,wt:[13,14,15,16],wd:[.2,.2,.2,.4]},{t:20,wt:[20,21],wd:[.2,1]}];a.project.clip={start:12,end:30};a.project.offset=-.12;a.projectChanged();a.refreshAudio();a.emit('reset');a.selectTab('words')});
  const snapshot=()=>page.evaluate(()=>{const a=window.__app,w=a.panels.words;return {sync:structuredClone(a.project.sync),clip:structuredClone(a.project.clip),sel:w.sel,a:w.strip.a,b:w.strip.b,follow:w.follow,state:a.player.state,range:a.player.auditionRange}});
  const initial=await snapshot();
  const block=page.locator('.sb[data-src="0"][data-k="1"]');
  touch?await block.tap():await block.click();
  let state=await snapshot();check(state.sel.k===1&&state.state==='paused'&&!state.follow,`${width}: native selection is silent and releases follow`);
  assert.deepEqual(state.sync,initial.sync);
  await page.getByRole('button',{name:'Ver todo el tramo',exact:true}).click();
  const whole=await snapshot(),other=page.locator('.sb[data-src="1"][data-k="0"]');
  touch?await other.tap():await other.click();
  state=await snapshot();check(state.sel.src===1&&state.a===whole.a&&state.b===whole.b,`${width}: picking a visible word in another phrase does not recenter`);
  await page.getByRole('button',{name:'Frase anterior',exact:true}).click();
  touch?await block.tap():await block.click();
  await page.getByRole('button',{name:'Bucle A–B',exact:true}).click();
  await page.getByRole('button',{name:'Escuchar palabra',exact:true}).click();
  await page.waitForFunction(()=>window.__app.player.state==='playing'&&!window.__app.audio.paused);
  const listening=await snapshot();assert.deepEqual(listening.clip,initial.clip);
  await page.waitForTimeout(1450);
  state=await snapshot();check(state.state==='playing'&&state.range&&state.a===listening.a&&state.b===listening.b,`${width}: audio repeats in A–B without moving viewport`);
  await page.getByRole('button',{name:'Bucle A–B',exact:true}).click();
  await page.waitForFunction(()=>{const p=window.__app.player;return p.state==='paused'&&p.t>=p.auditionRange.b});
  await page.getByRole('button',{name:'Reproducir',exact:true}).click();
  await page.waitForFunction(()=>{const p=window.__app.player;return p.state==='playing'&&p.t>=p.auditionRange.a&&p.t<p.auditionRange.b});
  check(true,`${width}: ordinary transport resumes an ended audition from A`);
  await page.getByRole('button',{name:'Detener audición',exact:true}).click();
  await page.getByRole('button',{name:'Seguir',exact:true}).click();
  const input=page.getByRole('spinbutton',{name:'Inicio de palabra en segundos de canción',exact:true});
  await input.fill('13.9');await input.press('Tab');
  state=await snapshot();check(state.sync[0].wt[1]===13.9&&!state.follow,`${width}: numeric correction is exactly 100 ms and disables follow with clip 12 and offset -120 ms`);
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.deepEqual((await snapshot()).sync,initial.sync);
  await page.getByRole('button',{name:'Rehacer',exact:true}).click();assert.equal((await snapshot()).sync[0].wt[1],13.9);
  if(!touch){await block.focus();await page.keyboard.press('Control+z');assert.deepEqual((await snapshot()).sync,initial.sync);await page.keyboard.press('Control+Shift+z');assert.equal((await snapshot()).sync[0].wt[1],13.9);check(true,'desktop: keyboard undo/redo restores exact values');}
  const duration=page.getByRole('spinbutton',{name:'Duración cantada en segundos',exact:true});
  await duration.fill('.35');await duration.press('Tab');assert.equal((await snapshot()).sync[0].wd[1],.35);
  const ab=page.getByRole('button',{name:'Bucle A–B',exact:true}),listen=page.getByRole('button',{name:'Escuchar palabra',exact:true});
  touch?await ab.tap():await ab.click();
  touch?await listen.tap():await listen.click();
  await page.waitForFunction(()=>window.__app.player.state==='playing'&&!window.__app.audio.paused);
  const stop=page.getByRole('button',{name:'Detener audición',exact:true});touch?await stop.tap():await stop.click();
  check(true,`${width}: native audition controls remain reachable after editing numeric fields`);
  check(true,`${width}: duration and exact undo/redo work with the preview collapsed`);
  await page.getByRole('button',{name:'Ver la frase completa',exact:true}).click();
  const beforeCancel=await snapshot();
  const bounds=await block.boundingBox(),from={x:bounds.x+bounds.width*.3,y:bounds.y+bounds.height*.5};
  if(touch&&(process.env.PLAYWRIGHT_BROWSER||'chromium')==='chromium'){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+15,y:from.y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  }else{
   await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+15,from.y,{steps:4});
   await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
  }
  assert.deepEqual((await snapshot()).sync,beforeCancel.sync);
  const live=await page.evaluate(()=>{const w=window.__app.panels.words;return w.strip.words.find(x=>x.src===0&&x.k===1).on});
  assert.ok(Math.abs(live-(13.9-12-.12))<.001);check(true,`${width}: cancelled gesture restores both persistent and transient values`);
  await page.evaluate(()=>{const a=window.__app;a.player.pause();a.panels.words.audition.stop();a.panels.words.fitPhrase()});
  const hold=page.getByRole('button',{name:'Mover 0.02 segundos antes',exact:true});
  await hold.scrollIntoViewIfNeeded();const hb=await hold.boundingBox();
  const start=await snapshot(),count=await page.evaluate(()=>window.__app.history.past.length);
  await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.__app.history.past.length),count+1);
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.deepEqual((await snapshot()).sync,start.sync);
  check(true,`${width}: sustained nudge is one reversible operation`);
  await page.selectOption('[aria-label="Velocidad para corregir"]','.5');
  check(await page.evaluate(()=>window.__app.player.rate===.5&&window.__app.audio.preservesPitch),`${width}: slow playback preserves pitch and mark seconds`);
  await page.locator('#tab-style').click();
  const keep=await page.evaluate(()=>({seed:window.__app.project.seed,over:structuredClone(window.__app.project.over)}));
  await page.getByRole('button',{name:'Generar otra versión',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__app.project.seed),keep.seed+1);
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal(await page.evaluate(()=>window.__app.project.seed),keep.seed);
  check(true,`${width}: design generation is reversible`);
  await page.locator('#tab-words').click();
  if(width===390){await input.evaluate(el=>el.scrollIntoView({block:'end'}));await page.screenshot({path:'test/audit/timeline/after-edit-phone.png'});}
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(`${checks} adjustment checks passed`);
}finally{await browser.close();srv.close()}
