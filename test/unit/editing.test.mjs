import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,normalize,modelOf} from '../../js/project.js';
import {buildTimeline,pseudoLine} from '../../js/timeline.js';
import {readPayloadFromHtml} from '../../js/import.js';
import {Player} from '../../js/player.js';
import {TextLayer} from '../../js/text-layer.js';

const project=()=>({...newProject(),text:'Sol y música aquí\nUna nota sostenida',clip:{start:12,end:24},offset:-.12,sync:[{t:13,wt:[13,13.1,13.25,13.45],wd:[.05,.1,.1,.15]},{t:16,wt:[16,16.8,17.2],wd:[.2,.2,1.5]}]});
test('resuming an ended audition starts at A while ordinary playback keeps its position',()=>{
 const p={t:2,auditionRange:{a:1,b:2},seek(t){this.t=t},setState(s){this.state=s},resumeClock(){}};
 Player.prototype.resume.call(p);assert.equal(p.t,1);assert.equal(p.state,'playing');
 p.auditionRange=null;p.t=7;Player.prototype.resume.call(p);assert.equal(p.t,7);
});
test('karaoke chooses the current phrase when a held previous phrase overlaps',()=>{
 const make=t=>({line:{t,hideAt:5,words:[{onset:t,dur:1}]},pages:[[{k:0}]]});
 const layer={karaoke:[make(1),make(2)]};
 assert.equal(TextLayer.prototype.state.call(layer,2.1).item.line.t,2);
 assert.equal(TextLayer.prototype.state.call(layer,.8).active,-1);
});
for(const focus of ['word','line']) test(`rapid entries preserve readable time in ${focus} composition`,()=>{
 const p=project();p.style.focus=focus;const tl=buildTimeline(modelOf(p));
 for(const line of tl.lines)for(const w of line.words){assert.ok(w.appearDur<=w.visualWindow*.25+1e-10);assert.ok(w.visualWindow-w.appearDur>0);assert.ok(Number.isFinite(w.appearDur));}
 assert.deepEqual(p.sync,project().sync);
});
test('zero duration survives global, word override and pseudo line',()=>{
 const p=project();p.style.entryMs=0;
 let tl=buildTimeline(modelOf(p));assert.ok(tl.lines.every(l=>l.words.every(w=>w.appearDur===0)));
 p.style.entryMs=2500;p.over={'0.1':{entryMs:0},'0.2':{fx:'instant'}};
 tl=buildTimeline(modelOf(p));assert.equal(tl.lines[0].words[1].appearDur,0);assert.equal(tl.lines[0].words[2].appearDur,0);assert.equal(tl.lines[0].words[0].entryLimited,true);
 assert.equal(pseudoLine('Hola',0,{appearDur:0}).words[0].appearDur,0);
});
test('new fields normalize and reimport without losing a zero override',()=>{
 const p=project();Object.assign(p.style,{mainMode:'normal',karaokeMode:'ascii',karaokeFace:'serif',entryMs:0});p.over={'0.0':{mode:'normal',fx:'instant',entryMs:0,face:'hand'}};
 const clean=normalize(p);assert.deepEqual(clean.over,p.over);assert.deepEqual(clean.sync,p.sync);
 const imported=readPayloadFromHtml(`<script id="payload" type="application/json">${JSON.stringify(p)}</script>`);
 assert.deepEqual(imported.project.style,clean.style);assert.deepEqual(imported.project.over,p.over);
 const legacy=normalize({v:3,text:'Letra',sync:[{t:2}],style:{thick:.5}});assert.equal(legacy.style.karaokeMode,'ascii');assert.equal(legacy.style.mainMode,'ascii');assert.equal(legacy.style.thick,.5);
});
const signature=tl=>tl.lines.map(l=>({mood:l.mood,words:l.words.map(w=>({face:w.face,color:w.colKey,hold:w.hold,appear:w.appear,size:w.size}))}));
test('a seed is reproducible, manual choices prevail, empty groups freeze variation',()=>{
 const p=project();p.style.random=.85;p.over={'0.0':{face:'roman',col:'mint',fx:'instant',entryMs:0}};
 const first=buildTimeline(modelOf(p));assert.deepEqual(signature(first),signature(buildTimeline(modelOf(p))));
 p.seed++;const varied=buildTimeline(modelOf(p));assert.equal(varied.lines[0].words[0].face,'roman');assert.equal(varied.lines[0].words[0].colKey,'mint');assert.equal(varied.lines[0].words[0].appearDur,0);
 p.style.randomGroups=[];const fixed=signature(buildTimeline(modelOf(p)));p.seed+=17;assert.deepEqual(signature(buildTimeline(modelOf(p))),fixed);
});
test('randomizing only backgrounds preserves word choices',()=>{
 const p=project();p.style.randomGroups=['backgrounds'];p.style.random=.85;const first=signature(buildTimeline(modelOf(p))).map(l=>l.words);
 p.seed+=7;assert.deepEqual(signature(buildTimeline(modelOf(p))).map(l=>l.words),first);
});
test('color-only variations remain visible at every intensity without changing other groups',()=>{
 for(const intensity of [.15,.45,.85]){
  const p=project();p.style.random=intensity;p.style.randomGroups=['colors'];const before=signature(buildTimeline(modelOf(p)));p.seed++;const after=signature(buildTimeline(modelOf(p)));
  assert.notDeepEqual(after.map(l=>l.words.map(w=>w.color)),before.map(l=>l.words.map(w=>w.color)));
  const protectedGroups=lines=>lines.map(l=>({mood:l.mood,words:l.words.map(({color,...rest})=>rest)}));
  assert.deepEqual(protectedGroups(after),protectedGroups(before));assert.deepEqual(p.sync,project().sync);
 }
});
test('rhyme styling cannot replace manual font or color on the last word',()=>{
 const p={...newProject(),text:'Una luna\nMi fortuna',clip:{start:0,end:10},sync:[{t:1,wt:[1,2],wd:[.2,.4]},{t:4,wt:[4,5],wd:[.2,.4]}],over:{'1.1':{face:'round',col:'mint'}}};
 p.style.faces=['serif'];const w=buildTimeline(modelOf(p)).lines[1].words[1];
 assert.equal(w.face,'round');assert.equal(w.colKey,'mint');
});
