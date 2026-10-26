import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../../js/player.js';
import * as Project from '../../js/project.js';
import {buildTimeline} from '../../js/timeline.js';
import {parseTimed,toLines,readPayloadFromHtml} from '../../js/import.js';
import {validateMedia} from '../../js/media-preflight.js';
import * as store from '../../js/store.js';
import * as Timing from '../../js/words/timing.js';
import {EditHistory} from '../../js/edit-history.js';
const {newProject,normalize,modelOf,parseClock,fmtTimeMs,fmtRuler}=Project;
const MAX_LYRIC_CHARS=Project.MAX_LYRIC_CHARS??100000;

test('a stale audio preparation cannot unmute a newer one or leave it muted',async()=>{
 const releases=[];
 const audio={muted:false,play:()=>new Promise(resolve=>releases.push(resolve)),pause(){}};
 const p=Object.assign(Object.create(Player.prototype),{audio,playEpoch:1,virtual:false});
 const first=p.prepareGesture();p.playEpoch++;const second=p.prepareGesture();
 releases[0]();assert.equal(await first,false);assert.equal(audio.muted,true,'new preparation must remain silent');
 releases[1]();assert.equal(await second,true);assert.equal(audio.muted,false,'successful preparation restores audible playback');
});

test('pausing a pending audio preparation restores the original mute state immediately',async()=>{
 let release;const audio={muted:false,play:()=>new Promise(resolve=>release=resolve),pause(){}};
 const p=Object.assign(Object.create(Player.prototype),{audio,playEpoch:1,virtual:false,state:'paused',setState(s){this.state=s}});
 const pending=p.prepareGesture();p.pause();assert.equal(audio.muted,false);release();assert.equal(await pending,false);
});

test('seeking away from the closing fade restores full volume',()=>{
 const audio={currentTime:9.95,volume:.12};
 const p=Object.assign(Object.create(Player.prototype),{audio,virtual:false,dur:10});
 p.seek(1);assert.equal(audio.currentTime,1);assert.equal(audio.volume,1);
});

test('a natural media end repeats an audition ending at the clip boundary',async()=>{
 const original=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>0;
 const audio=new EventTarget();Object.assign(audio,{muted:false,volume:.1,currentTime:10,paused:true,pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}});
 let p;
 try{p=new Player({wpCursor:0},audio,new EventTarget(),'studio');}finally{if(original)globalThis.requestAnimationFrame=original;else delete globalThis.requestAnimationFrame;}
 Object.assign(p,{virtual:false,dur:10,state:'playing',auditionRange:{a:8,b:10,loop:true}});
 audio.dispatchEvent(new Event('ended'));await Promise.resolve();
 assert.equal(p.state,'playing');assert.equal(audio.currentTime,8);assert.equal(audio.volume,1);p.scope.abort();
});

test('the final clock tolerance cannot finish an audition before its B boundary',()=>{
 const p=Object.assign(Object.create(Player.prototype),{state:'playing',dur:10,mode:'studio',virtual:false,audio:{volume:1},auditionRange:{a:9,b:10,loop:true},time:()=>9.995,finish(){throw Error('audition finished early')}});
 assert.equal(p.clock(1),9.995);assert.equal(p.state,'playing');assert.equal(p.audio.volume,1);
});

test('enhanced LRC and relative conversion retain three decimal places',()=>{
 const rows=parseTimed('[00:13.155]<00:13.155>Luz <00:13.255>azul','precise.lrc');
 assert.deepEqual(rows[0].wt,[13.155,13.255]);
 assert.deepEqual(toLines(rows,12,10).lines[0],[1.155,'Luz azul',[1.155,1.255]]);
});

test('malformed clock fields are rejected instead of silently changing their meaning',()=>{
 for(const value of ['1::2','1:02:03:99','1:99','1:60:00','-1:30',':23','1:'])assert.ok(Number.isNaN(parseClock(value)),value);
 for(const [value,seconds]of [['83',83],['01:23.155',83.155],['1:02:03,250',3723.25]])assert.equal(parseClock(value),seconds);
});

test('a word override does not change a separate occurrence of a repeated phrase',()=>{
 const p={...newProject(),text:'Luna junto a ti\nLuna junto a ti',sync:[{t:1},{t:8}],clip:{start:0,end:18}};
 const automatic=buildTimeline(modelOf(p)).lines[1].words.map(({face,colKey,size})=>({face,colKey,size}));
 p.over={'0.0':{face:'roman',col:'ruby',size:1.7}};const result=buildTimeline(modelOf(p));
 assert.equal(result.lines[0].words[0].face,'roman');
 assert.deepEqual(result.lines[1].words.map(({face,colKey,size})=>({face,colKey,size})),automatic);
});

test('a final word in the last 150 ms remains renderable and enters within the actual clip',()=>{
 const p={...newProject(),text:'Final',sync:[{t:9.85,wt:[9.85],wd:[.1]}],clip:{start:0,end:10},offset:0};
 const tl=buildTimeline(modelOf(p));assert.equal(tl.lines.length,1);
 const w=tl.lines[0].words[0];assert.ok(w.appearDur<=(10-w.onset)*.25+1e-9);
});

test('cropping through a word-timed phrase preserves its audible later words',()=>{
 const p={...newProject(),text:'Antes después',sync:[{t:11,wt:[11,13],wd:[.2,.3]}],clip:{start:12,end:16},offset:0};
 const original=structuredClone(p.sync),tl=buildTimeline(modelOf(p));assert.equal(tl.lines.length,1);
 assert.deepEqual(tl.lines[0].words.map(w=>w.onset),[-1,1]);assert.deepEqual(p.sync,original);
});

test('audio shorter than the supported one-second clip is rejected before project replacement',()=>{
 assert.throws(()=>validateMedia({size:1024},.4,{bytes:2048,pcmBytes:1048576}),/segundo/);
 assert.doesNotThrow(()=>validateMedia({size:1024},1,{bytes:2048,pcmBytes:1048576}));
});

async function database(mock,run){
 const saved=new Map(['window','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperty(globalThis,'window',{value:{indexedDB:mock},configurable:true});Object.defineProperty(globalThis,'indexedDB',{value:mock,configurable:true});
 try{await run();}finally{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
test('a blocked database open closes a connection that succeeds after rejection',async()=>{
 let request,closed=0;
 await database({open(){request={};return request}},async()=>{
  const pending=store.putProject('p',{},'test');request.onblocked();await assert.rejects(pending,/pestañas/);
  request.result={close(){closed++}};request.onsuccess();assert.equal(closed,1);
 });
});
test('a synchronous storage failure releases its database connection',async()=>{
 let closed=0;
 await database({open(){const request={result:{transaction(){throw Error('transaction unavailable')},close(){closed++}}};queueMicrotask(()=>request.onsuccess());return request}},async()=>{
  await assert.rejects(store.putProject('p',{},'test'),/transaction unavailable/);assert.equal(closed,1);
 });
});
test('an obsolete file write cannot overwrite the replacement after reading bytes',async()=>{
 let release,opened=0;const controller=new AbortController();
 await database({open(){opened++;throw Error('obsolete write reached storage')}},async()=>{
  const source={arrayBuffer:()=>new Promise(resolve=>release=resolve)};
  const pending=store.putFile('p',source,'old.wav','audio/wav','old-media',{signal:controller.signal});
  controller.abort();release(new ArrayBuffer(4));await assert.rejects(pending,{name:'AbortError'});assert.equal(opened,0);
 });
});
test('canceling or committing an old edit batch cannot restore data into another context',()=>{
 for(const action of ['cancel','commit']){
  const app={id:'first',project:newProject(),emit(){},projectChanged(){},rebuild(){}};
  const h=Object.assign(Object.create(EditHistory.prototype),{app,past:[],future:[]});h.reset();h.begin();
  app.id='second';app.project={...newProject(),text:'Otro proyecto',seed:42};
  const before=structuredClone(app.project);h[action]();assert.deepEqual(app.project,before);assert.equal(h.batch,null);assert.equal(h.past.length,0);
 }
});

test('short explicit word intervals survive rendering without introducing a synthetic gap',()=>{
 const p={...newProject(),text:'Una voz veloz',sync:[{t:1,wt:[1,1.05,1.1],wd:[.05,.05,.05]}],clip:{start:0,end:3},offset:0};
 assert.deepEqual(buildTimeline(modelOf(p)).lines[0].words.map(w=>w.onset),[1,1.05,1.1]);
});
test('precise editing can use the full interval between adjacent word onsets',()=>{
 const p={...newProject(),text:'Una voz',sync:[{t:1,wt:[1,1.1],wd:[.05,.05]}],clip:{start:0,end:3},offset:0};
 const self={app:{project:p,media:{dur:3}},holdMin:()=>.6,limitToast(){},afterTime(){}};
 self.ensureWordLevel=()=>p.sync[0];self.limitsAbs=(...args)=>Timing.limitsAbs(self,...args);
 assert.equal(Timing.setStartAbs(self,0,0,1.04,false),true);assert.equal(p.sync[0].wt[0],1.04);
});
test('clock labels carry rounded seconds and distinguish fractional ruler ticks',()=>{
 assert.equal(fmtTimeMs(59.999),'1:00.00');assert.equal(fmtTimeMs(-59.999),'-1:00.00');
 assert.equal(fmtRuler(0,.5),'0:00.0');assert.equal(fmtRuler(.5,.5),'0:00.5');assert.equal(fmtRuler(.25,.25),'0:00.25');
 assert.equal(fmtRuler(60,1),'1:00');
});
test('enhanced LRC keeps text preceding its first inline word timestamp',()=>{
 const rows=parseTimed('[00:01.000]Mi <00:01.100>luz <00:01.200>azul','words.lrc');
 assert.equal(rows[0].text,'Mi luz azul');assert.deepEqual(rows[0].wt,[1,1.1,1.2]);
});
test('subtitle entities become literal lyric characters without interpreting markup',()=>{
 const rows=parseTimed('WEBVTT\n\n00:01.000 --> 00:03.000\n<b>Tú &amp; yo</b> &lt;3 &#x1f3b5; &#39;','words.vtt');
 assert.equal(rows[0].text,"Tú & yo <3 🎵 '");
});
test('oversized lyrics fail before normalization or import can silently truncate work',()=>{
 const text='a'.repeat(MAX_LYRIC_CHARS+1);
 assert.throws(()=>normalize({...newProject(),text}),/límite/);
 assert.throws(()=>parseTimed('[00:01.000]'+text,'large.lrc'),/límite/);
 assert.throws(()=>readPayloadFromHtml(`<script id="payload" type="application/json">${JSON.stringify({lines:[[1,text]]})}</script>`),/límite/);
 assert.equal(normalize({...newProject(),text:text.slice(1)}).text.length,MAX_LYRIC_CHARS);
});
test('a no-op timing edit does not silently materialize or change phrase marks',()=>{
 const p={...newProject(),text:'Una palabra',sync:[{t:1}],clip:{start:0,end:10},offset:0};
 const app={project:p,clip:()=>p.clip,media:{dur:10}},line=buildTimeline(modelOf(p)).lines[0];
 const self={app,phrases:()=>[{words:['Una','palabra']}],line:()=>line,holdMin:()=>.6,limitToast(){},afterTime(){throw Error('no-op committed')}};
 self.ensureWordLevel=src=>Timing.ensureWordLevel(self,src);self.limitsAbs=(...args)=>Timing.limitsAbs(self,...args);
 const before=structuredClone(p.sync);assert.equal(Timing.setStartAbs(self,0,0,1),false);assert.deepEqual(p.sync,before);
});
