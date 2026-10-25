import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Autosave} from '../../js/storage/autosave.js';
import {readPayloadFromHtml} from '../../js/import.js';
import {normalize,modelOf} from '../../js/project.js';
import {buildTimeline} from '../../js/timeline.js';
import {Player} from '../../js/player.js';

test('a second flush cannot report success while the first leaves unsaved work',async()=>{
 let rejectFirst;let calls=0;
 const s=new Autosave(async()=>{if(++calls===1)await new Promise((_,reject)=>rejectFirst=reject);else throw Error('quota');});
 s.schedule('A',{text:'Keep this'});const first=s.flush();await new Promise(resolve=>setImmediate(resolve));
 const second=s.flush();rejectFirst(Error('quota'));
 assert.equal(await first,false);assert.equal(await second,false);assert.equal(s.pending.size,1);
});
test('successful saves release old immutable snapshots',async()=>{
 const s=new Autosave(async()=>{});for(let i=0;i<20;i++)await s.save(String(i),{text:'large project'});
 assert.equal(s.latest.size,0);
});
test('malformed imported messages and overrides cannot poison rendering',()=>{
 const data={v:3,text:'Hola mundo',sync:[{t:1}],intro:{bad:true},outro:[],over:{'0.0':{size:'bad',col:{},fx:{},pal:{},ext:'oops'},p0:{mood:{},exit:[]}}};
 const parsed=readPayloadFromHtml(`<script id="payload" type="application/json">${JSON.stringify(data)}</script>`);
 assert.equal(typeof parsed.intro,'string');assert.equal(typeof parsed.outro,'string');
 const p=normalize(data);const tl=buildTimeline(modelOf(p,{start:0,end:10}));
 for(const u of tl.units)for(const w of u.words){assert.ok(Number.isFinite(w.size));assert.equal(typeof w.appear,'string');}
 assert.deepEqual(p.over,{});
});
test('legacy null timestamps remain unmarked instead of silently becoming zero',()=>{
 const parsed=readPayloadFromHtml('<script id="payload" type="application/json">{"lines":[[null,"Sin marcar"],[2,"Marcada"]]}</script>');
 assert.equal(parsed.lines[0][0],null);assert.equal(parsed.lines[1][0],2);
});
test('valid manual controls survive project normalization',()=>{
 const p=normalize({style:{caps:'all',palette:'rosa',fillch:'%',ball:false},over:{'0.0':{size:1.5,thick:0,ext:0,fx:'rise',fill:false,fxs:[]},p0:{exit:'wipe',mood:'waves'}}});
 assert.equal(p.style.caps,'all');assert.equal(p.style.ball,false);assert.equal(p.over['0.0'].size,1.5);assert.equal(p.over['0.0'].fill,false);assert.deepEqual(p.over['0.0'].fxs,[]);assert.equal(p.over.p0.mood,'waves');
});
test('disabling every automatic effect does not re-enable the default effect set',()=>{
 const p=normalize({text:'¡Amor amor amor!\n¡Amor amor amor!',sync:[{t:1},{t:5}],style:{fxAuto:1,fxSet:[],caps:'all'}});
 const tl=buildTimeline(modelOf(p,{start:0,end:20}));assert.ok(tl.lines.every(l=>l.words.every(w=>w.fxs.length===0&&w.caps)));
});
test('a rejected old play request cannot reset a later pause',async()=>{
 let rejectPlay;const p=Object.create(Player.prototype);
 Object.assign(p,{audio:{play:()=>new Promise((_,reject)=>rejectPlay=reject),pause(){},currentTime:0},virtual:false,state:'playing',mode:'player',scene:{},rate:1,time:()=>0});
 const attempt=p.resumeClock();p.pause();rejectPlay(Error('cancelled'));await attempt;assert.equal(p.state,'paused');
});
test('overlapping wake-lock requests acquire and release only one sentinel',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolveLock,calls=0,releases=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{wakeLock:{request:()=>{calls++;return new Promise(resolve=>resolveLock=resolve)}}}});
 try{
  const p=Object.create(Player.prototype);Object.assign(p,{state:'playing',scene:{},audio:{pause(){}},virtual:true,time:()=>0});
  const one=p.keepAwake(),two=p.keepAwake();resolveLock({release:async()=>{releases++},addEventListener(){}});await Promise.all([one,two]);p.pause();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);assert.equal(releases,1);
 }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
