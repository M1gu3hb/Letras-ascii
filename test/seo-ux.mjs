import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {serve,launch,watch,openMarkOptions} from './lib.mjs';
import '../scripts/fixtures.mjs';

const folder='test/audit/seo-ux',kind=process.env.PLAYWRIGHT_BROWSER||'chromium',started=Date.now();mkdirSync(folder,{recursive:true});
const {srv,port}=serve('site'),origin=`http://localhost:${port}`,browser=await launch(),errors=[];let checks=0;
const ok=(condition,message)=>{assert.ok(condition,message);checks++;console.log('ok',message)};
const ready=page=>page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
const focused=async(page,selector)=>{try{await page.waitForFunction(s=>document.activeElement?.matches(s),selector,{polling:50})}catch(error){console.error('keyboard focus diagnostic',await page.evaluate(()=>({focus:document.hasFocus(),active:document.activeElement.outerHTML.slice(0,250)})));throw error}};
const within=async locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=44&&r.height>=44&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1&&(el===hit||el.contains(hit))});
try{
 const raw=await(await fetch(origin)).text();
 ok(/name="robots" content="index, follow"/.test(raw),'public HTML allows indexing');
 ok(/name="description" content="[^"<>]{80,}/.test(raw)&&/rel="canonical" href="https:\/\/letras-ascii.vercel.app\/"/.test(raw),'description and canonical exist before JavaScript');
 const schema=JSON.parse(raw.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
 ok(schema['@type']==='WebApplication'&&schema.url==='https://letras-ascii.vercel.app/'&&schema.inLanguage==='es','structured data describes the public app');
 ok(/property="og:image" content="https:\/\/letras-ascii.vercel.app\/social-card.png"/.test(raw)&&/name="twitter:card" content="summary_large_image"/.test(raw),'social metadata uses the production image URL');
 for(const path of ['robots.txt','sitemap.xml','favicon.svg','social-card.png']){const response=await fetch(`${origin}/${path}`);ok(response.ok,`${path} is served`)}
 const image=readFileSync('site/social-card.png');ok(image.readUInt32BE(16)===1200&&image.readUInt32BE(20)===630,'social image is 1200 by 630');
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:700}}),staticPage=await nojs.newPage();
 await staticPage.goto(origin);ok(await staticPage.getByRole('heading',{level:1}).count()===1,'one meaningful H1 exists without JavaScript');
 for(const name of ['Canción','Letra','Marcar','Ajustar','Estilo','Exportar'])ok(await staticPage.getByRole('heading',{name,exact:true}).count()===1,`the ${name} guide is readable without JavaScript`);
 await staticPage.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));ok(await staticPage.evaluate(()=>scrollY>0),'the static guide can scroll to its end');
 await staticPage.screenshot({path:`${folder}/static-guide-${kind}.png`});await nojs.close();

 const slowContext=await browser.newContext(),slow=await slowContext.newPage();let release,blocked=0;const gate=new Promise(resolve=>release=resolve);
 await slow.route('**/fonts/**',async route=>{if(route.request().url().endsWith('/nunito-latin-800-normal.woff2')){await route.abort('failed');return}blocked++;await gate;await route.continue().catch(()=>{})});
 try{
  await slow.goto(origin,{waitUntil:'domcontentloaded'});await slow.getByRole('button',{name:'Guía de uso',exact:true}).waitFor({state:'visible',timeout:5000});
  ok(blocked>0&&await slow.getByRole('tab').count()===6,'editor controls appear while artistic fonts are still blocked');
  await slow.waitForFunction(()=>[...document.fonts].some(font=>font.status==='error'));await slow.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  ok(!await slow.evaluate(()=>document.documentElement.classList.contains('ready')),'one failed font cannot finalize layout while other fonts are pending');
  await slow.getByRole('button',{name:'Guía de uso',exact:true}).click();ok(await slow.getByRole('dialog',{name:'Guía de uso',exact:true}).isVisible(),'help works before fonts finish');
  await slow.getByRole('button',{name:'Cerrar guía',exact:true}).click();
  release();await ready(slow);ok(true,'font metrics are finalized after all font requests settle, including failures');
 }finally{release();await slowContext.close()}

 const devices=[['phone-320',320,568,true],['phone-390',390,700,true],['phone-land',844,390,true],['tablet-p',768,1024,true],['tablet-l',1180,820,true],['small-desktop',1024,680,false],['desktop',1440,900,false],['reflow-200',720,450,false]];
 for(const [name,width,height,touch]of devices){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(12000);watch(page,errors);await page.goto(origin);await ready(page);await page.bringToFront();await page.waitForFunction(()=>document.hasFocus(),null,{polling:100});
  if(name==='phone-390')await page.screenshot({path:`${folder}/start-${kind}.png`});
  ok(await within(page.getByRole('button',{name:'Guía de uso',exact:true})),`${name}: help is visible and at least 44px`);
  ok(await page.getByRole('heading',{level:1}).count()===1,`${name}: runtime retains one H1`);
  if(name==='phone-land'||name==='reflow-200')ok(await page.locator('.panel').evaluate(el=>el.clientWidth>=innerWidth*.85),`${name}: a folded preview returns the full width to editing`);
  await page.keyboard.press('Tab');await focused(page,'.skip-link');ok(await page.getByRole('link',{name:'Saltar al paso actual'}).evaluate(el=>el===document.activeElement),`${name}: keyboard can skip repeated navigation`);
  await page.keyboard.press('Enter');await focused(page,'[role=tabpanel]:not([hidden])');ok(await page.getByRole('tabpanel').evaluate(el=>el===document.activeElement),`${name}: skip link focuses the active panel`);
  await page.keyboard.press('Tab');await focused(page,'.step-footer .primary');ok(await page.locator('.step-footer').getByRole('button',{name:'Elegir canción o video',exact:true}).evaluate(el=>el===document.activeElement),`${name}: the next keyboard stop is the visible upload action, not a clipped input`);
  const projectName=page.getByRole('textbox',{name:'Nombre del proyecto'});await projectName.focus();
  ok(await projectName.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'),`${name}: project name has a visible keyboard focus indicator`);
  await page.getByRole('button',{name:'Guía de uso',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Guía de uso',exact:true});ok(await dialog.isVisible()&&await page.locator('#app').evaluate(el=>el.inert),`${name}: guide is modal`);
  if(name==='phone-390')await page.screenshot({path:`${folder}/guide-${kind}.png`});
  await page.getByRole('button',{name:'Cerrar guía',exact:true}).press('Escape');ok(await page.getByRole('button',{name:'Guía de uso',exact:true}).evaluate(el=>el===document.activeElement),`${name}: closing help restores its opener`);
  await page.setInputFiles('#songfile','test/media/kick120.wav');await page.waitForFunction(()=>window.__app.media&&!window.__app.loadController);
  if(name==='phone-320')ok(await page.locator('.trow.main .time').evaluate(el=>{const bounds=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);return[...range.getClientRects()].every(r=>r.left>=bounds.left-1&&r.right<=bounds.right+1)}),'phone-320: precise time labels fit without covering preview controls');
  await page.getByRole('button',{name:'Siguiente: Letra',exact:true}).click();ok(await page.getByRole('tabpanel').evaluate(el=>el===document.activeElement),`${name}: Next focuses the destination`);
  const intro=page.getByRole('textbox',{name:'Texto de inicio',exact:true});const id=await intro.getAttribute('id');
  await page.locator(`label[for="${id}"]`).click();ok(await intro.evaluate(el=>el===document.activeElement),`${name}: the visible label focuses its input`);
  await page.getByRole('textbox',{name:'Letra de la canción',exact:true}).fill('Luz contigo\nMúsica aquí\nSiempre cerca');
  if(name==='phone-390'){
   await page.setViewportSize({width:390,height:400});await page.waitForFunction(()=>Math.abs(parseFloat(window.__app.root.style.getPropertyValue('--app-height'))-400)<1);
   const next=page.getByRole('button',{name:'Siguiente: Marcar',exact:true});ok(await within(next),'phone-390: a reduced viewport keeps Next above the footer');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:`${folder}/text-small-height-${kind}.png`});await next.tap();await page.setViewportSize({width,height});
  }else await page.getByRole('button',{name:'Siguiente: Marcar',exact:true}).click();
  if(name==='phone-390'){
   await openMarkOptions(page);await page.getByRole('button',{name:'Solo frases',exact:true}).click();
   const toggle=page.locator('.mopts .switch');if(await toggle.locator('input').isChecked())await toggle.click();
   const options=page.getByRole('button',{name:'Configurar modo y cuenta regresiva',exact:true});if(await options.isVisible()&&await options.getAttribute('aria-expanded')==='true')await options.click();
   await page.locator('.mcard.idle .primary').click();await page.waitForFunction(()=>window.__app.panels.mark.phase==='run'&&!window.__app.audio.paused&&window.__app.audio.currentTime>.05);
   for(let i=0;i<3;i++){await page.locator('.pad').tap();if(i<2)await page.waitForTimeout(400)}
   await page.waitForFunction(()=>window.__app.panels.mark.phase==='done'&&!window.__app.panels.mark.locked());
   ok(await page.evaluate(()=>window.__app.project.sync.filter(Boolean).length===3),'phone-390: native capture completes three phrases');
  }else await page.evaluate(()=>{const a=window.__app;a.project.sync=[{t:1},{t:3},{t:5}];a.projectChanged();a.emit('reset')});
  await page.getByRole('button',{name:'Siguiente: Ajustar →',exact:true}).click();ok(await page.getByRole('tabpanel').evaluate(el=>el===document.activeElement),`${name}: completion focuses Adjust`);
  await page.getByRole('button',{name:'Siguiente: Estilo',exact:true}).click();
  const before=await page.locator('.panel').evaluate(el=>{el.scrollTop=500;return el.scrollTop});ok(before>0,`${name}: style has reachable scrollable controls`);
  await page.getByRole('button',{name:'Siguiente: Exportar',exact:true}).click();await page.getByRole('button',{name:'Atrás',exact:true}).click();
  ok(Math.abs(await page.locator('.panel').evaluate(el=>el.scrollTop)-before)<=2,`${name}: returning to style retains the work position`);
  if(name==='tablet-p'){
   const view=page.getByRole('button',{name:'Ocultar vista previa',exact:true});ok(await within(view),'tablet-p: preview can be folded');
   const panelHeight=await page.locator('.panel').evaluate(el=>el.clientHeight);await view.click();ok(await page.locator('.panel').evaluate(el=>el.clientHeight)>panelHeight,'tablet-p: folding preview returns space to editing');
  }
  await page.getByRole('button',{name:'Siguiente: Exportar',exact:true}).click();
  await page.screenshot({path:`${folder}/export-${name}-${kind}.png`});
  ok(await within(page.getByRole('button',{name:'Descargar el HTML',exact:true})),`${name}: download is reachable without a hidden overlay`);
  if(name==='phone-390'){
   await page.evaluate(()=>{window.open=()=>null});await page.getByRole('button',{name:'Vista del destinatario',exact:true}).click();
   await page.waitForFunction(()=>!window.__app.panels.export.making);const fallback=page.getByRole('link',{name:'Abrir vista del destinatario',exact:true});
   ok(await fallback.isVisible()&&(await fallback.getAttribute('href')).startsWith('blob:'),'a blocked popup provides an explicit usable preview link');
   await fallback.scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/popup-recovery-${kind}.png`});
   const preview=page.waitForEvent('popup');await fallback.click();const recipient=await preview;await recipient.bringToFront();await ready(recipient);await recipient.waitForFunction(()=>document.hasFocus(),null,{polling:100});
   ok(await recipient.getByRole('button',{name:'Reproducir',exact:true}).isVisible(),'the fallback link opens the actual recipient');
   await recipient.getByRole('button',{name:'Reproducir',exact:true}).click();await recipient.waitForFunction(()=>!window.__player.audio.paused&&window.__player.audio.currentTime>.3);await recipient.getByRole('button',{name:'Pausar',exact:true}).click();
   ok(await recipient.evaluate(()=>window.__player.audio.paused&&window.__player.t>.3),'the recipient can play native audio and pause');await recipient.screenshot({path:`${folder}/recipient-${kind}.png`});await recipient.close();await page.bringToFront();
   await page.evaluate(()=>{window.open=()=>{throw new DOMException('Popup blocked','SecurityError')}});await page.getByRole('button',{name:'Vista del destinatario',exact:true}).click();await page.waitForFunction(()=>!window.__app.panels.export.making);
   ok(await fallback.isVisible(),'a popup exception also recovers without leaving export stuck');
   const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar el HTML',exact:true}).click();const path='test/media/seo-ux-export.html';await(await downloading).saveAs(path);
   ok(/name="robots" content="noindex, nofollow, noarchive"/.test(readFileSync(path,'utf8')),'personal exported HTML stays out of search indexing');
   await projectName.fill('Proyecto'+'X'.repeat(52));await page.evaluate(()=>window.__app.save());await page.getByRole('button',{name:'Mis proyectos',exact:true}).click();
   const box=page.locator('.mbox');ok(await box.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'long project names do not overflow the modal');
   ok(await within(page.getByRole('button',{name:/^Borrar Proyecto/})),'long names keep the delete control reachable');
   await page.screenshot({path:`${folder}/long-project-${kind}.png`});await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  }
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: the viewport has no horizontal overflow`);await context.close();
 }
 const recoveryPage=await browser.newPage();watch(recoveryPage,errors);await recoveryPage.goto(origin);await ready(recoveryPage);await recoveryPage.click('#tab-export');
 for(const [name,destination]of [['Elegir canción','song'],['Añadir letra','text']]){
  await recoveryPage.getByRole('button',{name,exact:true}).click();ok(await recoveryPage.evaluate(()=>window.__app.tab)===destination,`missing requirements can recover through ${name}`);await recoveryPage.click('#tab-export');
 }
 await recoveryPage.click('#tab-text');await recoveryPage.getByRole('textbox',{name:'Letra de la canción',exact:true}).fill('Texto por marcar');await recoveryPage.click('#tab-export');await recoveryPage.getByRole('button',{name:'Marcar tiempos',exact:true}).click();ok(await recoveryPage.evaluate(()=>window.__app.tab)==='mark','missing timing links directly to capture');await recoveryPage.close();
 assert.deepEqual(errors,[]);console.log(`${checks} SEO and journey checks passed (${kind})`);
 writeFileSync(`${folder}/result-${kind}.json`,JSON.stringify({kind,checks,durationMs:Date.now()-started,errors,devices:devices.map(([name,width,height,touch])=>({name,width,height,touch}))},null,2));
}finally{await browser.close();srv.close()}
