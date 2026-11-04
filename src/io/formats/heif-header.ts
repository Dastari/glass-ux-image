import { ascii, ensure, range, u32 } from './bytes.js';
/** Bounded ISO-BMFF property walk; reject excessive declared dimensions before native allocation. */
export function checkHeifDimensions(bytes:Uint8Array,maxPixels:number) {
  let boxes=0;const sizes:{width:number;height:number}[]=[];
  function walk(start:number,end:number,depth:number) {
    ensure(depth<=12,'HEIF box nesting exceeds limit');
    for(let p=start;p<end;) {
      ensure(++boxes<=10000,'Too many HEIF boxes');range(bytes,p,8);const type=ascii(bytes.subarray(p+4,p+8));let n=u32(bytes,p),header=8;
      if(n===1) {ensure(u32(bytes,p+8)===0,'HEIF box exceeds limit');n=u32(bytes,p+12);header=16;}
      if(n===0)n=end-p;ensure(n>=header&&n<=end-p,'Invalid HEIF box length');
      if(type==='ispe') {ensure(n>=header+12);const width=u32(bytes,p+header+4),height=u32(bytes,p+header+8);ensure(width>0&&height>0&&width*height<=maxPixels,'HEIF exceeds pixel limit');sizes.push({width,height});}
      if(['meta','iprp','ipco'].includes(type))walk(p+header+(type==='meta'?4:0),p+n,depth+1);
      p+=n;
    }
  }
  walk(0,bytes.length,0);return sizes;
}
