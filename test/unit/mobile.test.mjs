import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../../js/player.js';
import {arm,cancelCount} from '../../js/mark/session.js';

test('countdown prepares the same audio element inside the initial gesture',async()=>{
 let release,started=false,paused=0;const audio={muted:false,play(){started=true;assert.equal(this.muted,true);return new Promise(resolve=>release=resolve)},pause(){paused++}};
 const player=Object.assign(Object.create(Player.prototype),{audio,playEpoch:1,virtual:false});
 const pending=player.prepareGesture();assert.equal(started,true);release();assert.equal(await pending,true);assert.equal(paused,1);assert.equal(audio.muted,false);
});
test('an obsolete preparation cannot pause a later playback operation',async()=>{
 let release,paused=0;const player=Object.assign(Object.create(Player.prototype),{audio:{muted:false,play:()=>new Promise(resolve=>release=resolve),pause(){paused++}},playEpoch:1,virtual:false});
 const pending=player.prepareGesture();player.playEpoch++;release();assert.equal(await pending,false);assert.equal(paused,0);assert.equal(player.audio.muted,false);
});
test('canceling a countdown also cancels a pending media preparation',async()=>{
 let resolve,done,runs=0;const app={media:{},tab:'mark',audioFull:{pause(){}},player:{loopClip:false,pause(){},seek(){},prepareGesture:()=>new Promise(r=>resolve=r)}};
 const self={app,countOn:true,phrases:()=>[{}],dropHold(){},startCount(fn){done=fn},goRun(){runs++}};
 arm(self,0,true);cancelCount(self);resolve(true);await done();assert.equal(runs,0);
});
