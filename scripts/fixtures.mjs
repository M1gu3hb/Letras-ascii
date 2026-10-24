import {mkdirSync,writeFileSync} from 'node:fs';
import {encodeWav} from '../js/analyze.js';
const rate=22050, samples=new Float32Array(rate*35);
for(let i=0;i<samples.length;i++){const t=i/rate; samples[i]=.45*Math.sin(2*Math.PI*65*t)*Math.exp(-(t%.5)*22);}
mkdirSync('test/media',{recursive:true});writeFileSync('test/media/kick120.wav',Buffer.from(encodeWav([samples],rate)));
