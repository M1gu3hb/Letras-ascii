import assert from 'node:assert/strict';
import {copyFileSync} from 'node:fs';
import {serve,launch} from './lib.mjs';
copyFileSync('js/store.js','site/store-test.js');const {srv,port}=serve('site');const b=await launch();const page=await b.newPage();
try{
 await page.goto(`http://localhost:${port}/`);await page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
 const result=await page.evaluate(async()=>{
  await new Promise((resolve,reject)=>{const r=indexedDB.open('letras-ascii',1);r.onupgradeneeded=()=>r.result.createObjectStore('proyectos',{keyPath:'id'});r.onerror=reject;r.onsuccess=()=>{const db=r.result;const tx=db.transaction('proyectos','readwrite');const s=tx.objectStore('proyectos');s.put({id:'legacy',kind:'project',name:'Proyecto anterior',updated:1,project:{text:'No se pierde',song:{size:4000000}}});s.put({id:'legacy:file',kind:'file',blob:new Blob([new Uint8Array(4000000)])});tx.oncomplete=()=>{db.close();resolve()}}});
  const store=await import('/store-test.js');
  const getAll=IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll=()=>{throw Error('Must not load blobs to list projects')};
  let list;try{list=await store.listProjects()}finally{IDBObjectStore.prototype.getAll=getAll}
  const p=await store.getProject('legacy'),file=await store.getFile('legacy');await store.delProject('legacy');
  return {list,text:p.project.text,size:file.blob.size,empty:(await store.listProjects()).length,deleted:!(await store.getFile('legacy'))};
 });
 assert.equal(result.list[0].name,'Proyecto anterior');assert.equal(result.list[0].size,4000000);assert.equal(result.text,'No se pierde');assert.equal(result.size,4000000);assert.equal(result.empty,0);assert.equal(result.deleted,true);console.log('6 storage migration, indexed listing and deletion checks passed');
}finally{await b.close();srv.close()}
