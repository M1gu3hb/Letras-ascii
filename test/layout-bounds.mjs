import assert from 'node:assert/strict';
import {serve,launch,watch} from './lib.mjs';
const {srv,port}=serve('site');const browser=await launch();const errors=[];
try {
 for(const viewport of [{width:320,height:568},{width:1440,height:900}]){
  const page=await browser.newPage({viewport});watch(page,errors);
  await page.goto(`http://localhost:${port}/`);await page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
  await page.evaluate(()=>window.__app.openTheater());
  const failures=await page.evaluate(()=>{
   const scene=window.__app.scene;const failures=[];let index=0;
   for(const face of ['round','heavy','serif','script','tall','hand','wide','roman'])for(const thick of [-1,0,1])for(const text of ['ver','ver cómo se','extraordinariamente','HOOOOLA']){
    const words=text.split(' ').map(text=>({text,face,size:1,stretch:true,stretchEm:2.4,thick,caps:true}));
    scene.layoutLine({words,tone:'cream',pal:0},{y0:3,y1:scene.r.rows-4,Fmax:33,yShift:index++%2?-2:1.5});
    for(const w of words){
     const bounds=scene.typo.wordBounds(w.text.toUpperCase(),w.F,w.maxExtra,true,face,thick,scene.trackG);
     if(w.gx<0||w.gy<0||w.gx+w.Wb>scene.r.grid.cols||w.gy+w.Hb>scene.r.rows||Math.abs(bounds.width-w.Wb)>1||bounds.height!==w.Hb)failures.push({text:w.text,face,thick,x:w.gx,y:w.gy,w:w.Wb,h:w.Hb,cols:scene.r.grid.cols,rows:scene.r.rows});
    }
   }
   return failures;
  });
  assert.deepEqual(failures,[],JSON.stringify({viewport,failures}));console.log('ok raster bounds, eight font faces and three stroke widths',viewport);
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('layout bounds: no console, page or HTTP errors');
}finally{await browser.close();srv.close();}
