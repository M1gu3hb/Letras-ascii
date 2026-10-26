// Letras vectoriales y karaoke comparten medidas, páginas y coordenadas de la bolita.
// Solo se mide/rasteriza al construir el layout, nunca dentro del RAF.
import { fontStr } from './type.js';
import { clamp, graphemes } from './util.js';
const colors = { white:'#fff',cream:'#ffecde',blush:'#ffc4c4',rose:'#ff7096',pink:'#ff4fd8',ruby:'#e0245e',orange:'#ff8a3d',amber:'#ffb26c',gold:'#ffd75e',mint:'#7dffc4',cyan:'#4fe3ff',ice:'#cfeeff',violet:'#9a7bff',lav:'#c3b4ee' };

export class TextLayer {
  constructor(scene) { this.scene=scene; this.measure=document.createElement('canvas').getContext('2d'); this.cache=new Map(); this.hero=[]; this.karaoke=[]; this.style={}; }
  geometry() {
    const r=this.scene.r,st=this.scene.tl.style;
    const size=clamp(r.H*.043,12,26)*(st.karaokeSize??1);
    const lineHeight=size*1.4,padding=Math.max(8,r.W*.03);
    const band=Math.min(r.H*.43,lineHeight*2+size*.9);
    const bottom=Math.max(this.scene.bottomInset||0,Math.min(66,Math.max(14,r.H*.085)));
    return {size,lineHeight,padding,band,top:r.H-bottom-band};
  }
  layout() {
    const s=this.scene,r=s.r,tl=s.tl,st=tl.style;
    this.style=st; this.hero=[]; this.karaoke=[]; this.band=null; this.ball=null; this.visibleKaraoke=null;
    const containers=tl.focus==='word'?tl.units:tl.lines;
    for(const line of containers) for(const w of line.words) {
      if(w.renderMode!=='normal') continue;
      const text=w.caps?w.text.toUpperCase():w.text;
      let size=Math.max(10,w.Hb*r.cellH*.8);
      this.measure.font=fontStr(w.face,size);
      const width=this.measure.measureText(text).width;
      const scale=Math.min(1,Math.min(w.Wb*r.cellW*.94,r.W-16)/Math.max(1,width));
      size*=scale;
      const half=width*scale/2;
      this.hero.push({line,w,text,size,x:clamp((w.gx+w.Wb/2)*r.cellW,8+half,r.W-8-half),y:(w.gy+w.Hb/2)*r.cellH+r.offY});
    }
    if(st.karaokeOn===false) return;
    const {size,lineHeight,padding,band,top}=this.geometry();
    const face=st.karaokeFace||'round',font=fontStr(face,size);
    const width=r.W-padding*2;
    this.band={x:padding/2,y:top,w:r.W-padding,h:band};
    this.measure.font=font;
    for(const line of tl.lines) {
      const rows=[[]]; let used=0;
      const space=this.measure.measureText(' ').width;
      for(const w of line.words) {
        const pieces=[],chars=graphemes(w.text);let part='',count=0;
        for(const char of chars) {
          if(part && this.measure.measureText(part+char).width>width) {pieces.push({text:part,count});part='';count=0;}
          part+=char;count++;
        }
        if(part)pieces.push({text:part,count});
        let consumed=0;const sung=Math.max(.05,w.sung||w.dur);
        for(const {text,count} of pieces) {
          const measured=this.measure.measureText(text).width;
          if(used && used+space+measured>width){rows.push([]);used=0;}
          rows.at(-1).push({text,k:w.k,onset:w.onset+sung*consumed/chars.length,dur:sung*count/chars.length,width:measured,size,font,face});
          consumed+=count;
          used+=(used?space:0)+measured;
        }
      }
      const pages=[];
      for(let n=0;n<rows.length;n+=2){
        const page=[];
        rows.slice(n,n+2).forEach((row,j)=>{
          const total=row.reduce((sum,w)=>sum+w.width,0)+Math.max(0,row.length-1)*space;
          let x=(r.W-total)/2;
          for(const word of row){
            const item={...word,x,y:top+size*.9+j*lineHeight};
            if(st.karaokeMode==='ascii') item.ascii=this.raster(item);
            page.push(item);x+=word.width+space;
          }
        });
        pages.push(page);
      }
      this.karaoke.push({line,pages});
    }
  }
  raster(word) {
    const detail=this.style.karaokeDetail??1;
    const key=[word.text,word.font,detail].join('|');
    if(this.cache.has(key))return this.cache.get(key);
    const cv=document.createElement('canvas'),step=Math.max(1.2,word.size/14/detail),ch=step*2;
    const padding=Math.ceil(word.size*.25);
    cv.width=Math.ceil(word.width+padding*2);cv.height=Math.ceil(word.size*1.6);
    const cx=cv.getContext('2d',{willReadFrequently:true});cx.font=word.font;cx.textBaseline='top';cx.fillText(word.text,padding,0);
    const pixels=cx.getImageData(0,0,cv.width,cv.height).data,cells=[];
    for(let y=0;y<cv.height;y+=ch)for(let x=0;x<cv.width;x+=step){
      let value=0,count=0;
      for(let j=Math.floor(y);j<Math.min(cv.height,y+ch);j++)for(let i=Math.floor(x);i<Math.min(cv.width,x+step);i++){value+=pixels[(j*cv.width+i)*4+3];count++;}
      const a=value/Math.max(1,count)/255;
      if(a>.06)cells.push({x:x-padding,y,char:a>.6?'@':a>.3?'#':a>.15?'*':'.',alpha:Math.min(1,a*2)});
    }
    const result={cells,font:`700 ${ch*1.05}px "JetBrains Mono",monospace`};
    if(this.cache.size>512)this.cache.clear();this.cache.set(key,result);return result;
  }
  drawHero(ctx,t) {
    const reduced=this.scene.R.reduced;
    for(const item of this.hero){
      const {line,w,text,size,x,y}=item;
      if(t<w.onset||t>=line.hideAt)continue;
      const q=w.appearDur===0||reduced?1:clamp((t-w.onset)/w.appearDur);
      const exit=reduced?1:1-clamp((t-line.exitStart-(w.exitDelay||0))/Math.max(.001,w.exitDur));
      if(exit<=0)continue;
      ctx.save();ctx.globalAlpha=q*exit;ctx.translate(x,y);
      if(!reduced){
        const entering=1-q,fx=w.appear;
        if(['rise','drop','slide','fall'].includes(fx))ctx.translate(fx==='slide'?entering*-size:0,entering*size*(fx==='drop'?-1:1));
        if(['zoom','pop','burst','assemble','spiral'].includes(fx)){const scale=.65+.35*q;ctx.scale(scale,scale);}
        if(fx==='flip3d')ctx.scale(Math.max(.04,q),1);
        if(w.hold==='bob')ctx.translate(0,Math.sin(t*5)*size*.025);
        if(w.hold==='wave')ctx.rotate(Math.sin(t*2)*.025);
        if(w.hold==='breathe'){const sc=1+Math.sin(t*2)*.018;ctx.scale(sc,sc);}
        if(w.hold==='sway3d')ctx.scale(.96+Math.sin(t*2)*.04,1);
      }
      ctx.font=fontStr(w.face,size);ctx.textBaseline='middle';ctx.textAlign='center';ctx.lineJoin='round';ctx.lineWidth=Math.max(2,size*.035);ctx.strokeStyle='rgba(7,4,11,.85)';
      let visibleText=text;
      if(q<1&&['typewriter','decode','glitch','scan'].includes(w.appear)) {
        const count=Math.ceil(text.length*q);
        visibleText=w.appear==='typewriter'?text.slice(0,count):text.slice(0,count)+'·'.repeat(Math.max(0,text.length-count));
      }
      if(!reduced&&(w.fxs||[]).includes('blink'))ctx.globalAlpha*=.78+.22*Math.cos(t*15);
      ctx.strokeText(visibleText,0,0);ctx.fillStyle=colors[w.colKey]||colors.cream;
      if((w.fxs||[]).includes('glow')){ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=size*.12;}
      ctx.fillText(visibleText,0,0);ctx.restore();
    }
  }
  state(t) {
    let item;
    for(let i=this.karaoke.length-1;i>=0;i--) {const candidate=this.karaoke[i];if(t>=candidate.line.t&&t<candidate.line.hideAt){item=candidate;break;}}
    item ||= this.karaoke.find(({line})=>t>=line.t-.5&&t<line.hideAt);
    if(!item)return null;
    const words=item.line.words;
    let cursor=-1;for(let k=0;k<words.length;k++)if(words[k].onset<=t)cursor=k;
    const active=cursor>=0&&t<words[cursor].onset+Math.max(.05,words[cursor].sung||words[cursor].dur)?cursor:-1;
    const page=item.pages.filter(p=>p.some(w=>w.k===cursor&&w.onset<=t)).at(-1)||item.pages.find(p=>p.some(w=>w.k===cursor))||item.pages[0];
    return {item,active,page};
  }
  drawKaraoke(ctx,t) {
    const state=this.state(t);this.visibleKaraoke=state;
    if(!state)return;
    const {active,page}=state,band=this.band,contrast=this.style.karaokeContrast??1;
    ctx.save();ctx.globalAlpha=1;ctx.fillStyle=`rgba(7,4,11,${clamp(.5+contrast*.18,0,1)})`;
    ctx.fillRect(band.x,band.y,band.w,band.h);ctx.textAlign='left';ctx.textBaseline='top';
    for(const w of page){
      const current=w.k===active;
      ctx.fillStyle=current?'#ffffff':t>=w.onset?'#dbcfe5':'#efe5f4';
      const alpha=current?1:clamp(.55+contrast*.22,.65,1);
      ctx.globalAlpha=alpha;
      if(w.ascii){ctx.font=w.ascii.font;for(const cell of w.ascii.cells){ctx.globalAlpha=alpha*cell.alpha;ctx.fillText(cell.char,w.x+cell.x,w.y+cell.y);}ctx.globalAlpha=alpha;}
      else{ctx.font=w.font;ctx.fillText(w.text,w.x,w.y);}
      if(current){ctx.globalAlpha=1;ctx.fillStyle='#ffb6cf';ctx.fillRect(w.x,w.y+w.size*1.12,Math.max(2,w.width),Math.max(2,w.size*.08));}
    }
    const current=page.filter(w=>w.k===active&&w.onset<=t).at(-1)||page.find(w=>w.k===active);
    if(current&&this.scene.ballOn){
      const progress=clamp((t-current.onset)/Math.max(.001,current.dur));
      const x=current.x+current.width*(this.scene.R.reduced ? .5 : progress),y=current.y-5-(this.scene.R.reduced?0:Math.sin(progress*Math.PI)*5);
      this.ball={x,y,k:active};ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,Math.max(2,current.size*.12),0,Math.PI*2);ctx.fillStyle='#ffb6cf';ctx.fill();
    }else this.ball=null;
    ctx.restore();
  }
  draw(t,mode) {
    const r=this.scene.r,ctx=r.ctx;
    ctx.save();ctx.setTransform(r.dpr,0,0,r.dpr,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.filter='none';
    if(mode==='song'){this.drawHero(ctx,t);if(this.style.karaokeOn!==false)this.drawKaraoke(ctx,t);}
    ctx.restore();
  }
}
