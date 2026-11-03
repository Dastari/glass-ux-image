// Run with Node 24: node apps/demo/scripts-generate-sample.mjs
// Deterministic, repository-owned sample. Runtime opening needs no procedural full-image render.
import { pixel } from './src/scene.ts';
import { crc32, deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const width=1500,height=1000,rows=Buffer.alloc((width*3+1)*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const rgb=pixel((x+.5)/width,(y+.5)/height),offset=y*(width*3+1)+1+x*3;
  for(let c=0;c<3;c++)rows[offset+c]=Math.round(Math.min(1,Math.max(0,rgb[c]))*255);
}
const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([len,body,crc]);};
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header.set([8,2,0,0,0],8);
writeFileSync(new URL('./src/assets/sample.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
