import { ascii, ensure, range, u16, u32 } from './bytes.js';
import { sniffFormat } from './index.js';
/** Header dimensions before native allocation. JPEG markers are bounded; no entropy decoding. */
export function imageDimensions(bytes: Uint8Array): {width:number;height:number}|null {
  const format=sniffFormat(bytes); let width=0,height=0;
  if(format==='svg') return null;
  if(format==='png') { ensure(ascii(bytes.subarray(12,16))==='IHDR'); width=u32(bytes,16); height=u32(bytes,20); }
  if(format==='gif') { width=u16(bytes,6,true); height=u16(bytes,8,true); }
  if(format==='jpeg') {
    let p=2;
    while(p<bytes.length) {
      ensure(bytes[p++]===255); while(bytes[p]===255)p++;
      range(bytes,p,1); const marker=bytes[p++]!; ensure(marker!==0xda&&marker!==0xd9,'JPEG has no size header');
      const length=u16(bytes,p); ensure(length>=2); range(bytes,p,length);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) { ensure(length>=8); height=u16(bytes,p+3); width=u16(bytes,p+5); break; }
      p+=length;
    }
  }
  if(format==='webp') {
    let p=12;
    while(p<bytes.length) { range(bytes,p,8); const type=ascii(bytes.subarray(p,p+4)),n=u32(bytes,p+4,true); range(bytes,p+8,n);
      if(type==='VP8X') { ensure(n===10); width=1+bytes[p+12]!+bytes[p+13]!*256+bytes[p+14]!*65536; height=1+bytes[p+15]!+bytes[p+16]!*256+bytes[p+17]!*65536; break; }
      if(type==='VP8L') { ensure(n>=5&&bytes[p+8]===0x2f); const bits=u32(bytes,p+9,true); width=(bits&16383)+1; height=((bits>>>14)&16383)+1; break; }
      if(type==='VP8 ') { ensure(n>=10); width=u16(bytes,p+14,true)&16383; height=u16(bytes,p+16,true)&16383; break; }
      p+=8+n+(n%2);
    }
  }
  ensure(width>0&&height>0,'Missing image dimensions'); return {width,height};
}
/** Rejects decompression bombs before handing bytes to the browser. */
export function checkImageDimensions(bytes:Uint8Array,maxPixels=64*1024*1024) {
  ensure(Number.isSafeInteger(maxPixels)&&maxPixels>0&&maxPixels<=64*1024*1024,'Invalid pixel limit');
  const size=imageDimensions(bytes); if(size) ensure(size.width*size.height<=maxPixels,'Image exceeds pixel limit'); return size;
}
