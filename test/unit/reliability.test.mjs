import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Autosave} from '../../js/storage/autosave.js';
import {readPayloadFromHtml,parseTimed} from '../../js/import.js';
import {exportReady} from '../../js/export.js';
import {newProject} from '../../js/project.js';
import {validateMedia} from '../../js/media-preflight.js';
const html=(p)=>`<script id="payload" type="application/json">${JSON.stringify(p)}</script>`;
test('v3 round trip preserves missing marks, held durations and overrides',()=>{
 const p={...newProject(),text:'Hola mundo\nSin marcar',sync:[{t:1,wt:[1,2],wd:[.2,1.5]},null],over:{'0.1':{thick:.8}}};
 const d=readPayloadFromHtml(html(p));assert.equal(d.lines[1][0],null);assert.deepEqual(d.lines[0][3],[.2,1.5]);assert.deepEqual(d.project.over,p.over);
});
test('legacy HTML and LRC remain readable',()=>{assert.equal(readPayloadFromHtml(html({lines:[[1,'Hola']]})).lines[0][0],1);assert.equal(parseTimed('[00:01.20]Hola','a.lrc')[0].t,1.2);});
test('SRT/VTT starts are parsed without losing multiline text',()=>{assert.deepEqual(parseTimed('WEBVTT\n\n00:00:02.500 --> 00:00:04.000\nHola\nmundo','a.vtt'),[{t:2.5,text:'Hola mundo'}]);});
test('export readiness uses renderable clip content, not the global marked count',()=>{
 const project={...newProject(),text:'Hola mundo',sync:[{t:1}],clip:{start:10,end:18}};
 const a={project,media:{},clip:()=>project.clip};assert.equal(exportReady(a).done,0);assert.equal(exportReady(a).outside,1);
 project.clip={start:0,end:18};assert.equal(exportReady(a).done,1);
});
test('save keeps immutable snapshots and IDs when active project changes',async()=>{
 const writes=[];const s=new Autosave(async(id,p)=>writes.push([id,p.text]));const p={text:'anterior'};
 s.schedule('A',p);p.text='mutado';s.schedule('B',{text:'nuevo'});await s.flush();assert.deepEqual(writes,[['A','anterior'],['B','nuevo']]);
});
test('failed storage is reported and the pending snapshot can be retried',async()=>{
 let fail=true;const saved=[];const s=new Autosave(async(id,p)=>{if(fail)throw Error('quota');saved.push(p.text)});
 s.schedule('A',{text:'respaldo'});assert.equal(await s.flush(),false);fail=false;assert.equal(await s.flush(),true);assert.deepEqual(saved,['respaldo']);
});
test('empty, oversized and excessive PCM files are rejected before decode',()=>{
 const limits={bytes:100,pcmBytes:10000000};assert.throws(()=>validateMedia({size:0},0,limits),/vacío/);assert.throws(()=>validateMedia({size:101},0,limits),/límite/);assert.throws(()=>validateMedia({size:50},1300,limits),/20 minutos/);assert.throws(()=>validateMedia({size:50},100,limits),/memoria/);
});
test('an older failed save cannot overwrite a newer snapshot queued while it was writing',async()=>{
 let rejectFirst;let calls=0;const writes=[];
 const s=new Autosave(async(id,p)=>{calls++;if(calls===1)await new Promise((_,reject)=>rejectFirst=reject);writes.push(p.text)});
 s.schedule('A',{text:'old'});const first=s.flush();await new Promise(resolve=>setImmediate(resolve));
 s.schedule('A',{text:'latest'});const second=s.flush();rejectFirst(Error('retry'));await first;await second;await s.flush();assert.deepEqual(writes,['latest']);
});
