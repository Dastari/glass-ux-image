import { ascii, bounded, concat, crc32, ensure, range, u16, u32, utf8 } from './bytes.js';
export type RasterFormat = 'jpeg' | 'png' | 'webp';
export interface Chunk { type: string; data: Uint8Array; raw: Uint8Array }
export const PNG_SIGNATURE = new Uint8Array([137,80,78,71,13,10,26,10]);
/** Container parsing stops at JPEG's entropy stream; scan data is never interpreted as markers. */
export function chunks(bytes: Uint8Array, format: RasterFormat): Chunk[] {
  bounded(bytes); const out: Chunk[]=[]; let p = format==='jpeg'?2:format==='png'?8:12;
  if (format==='jpeg') ensure(u16(bytes,0)===0xffd8);
  if (format==='png') ensure(PNG_SIGNATURE.every((v,i)=>bytes[i]===v));
  if (format==='webp') ensure(ascii(bytes.subarray(0,4))==='RIFF' && ascii(bytes.subarray(8,12))==='WEBP' && u32(bytes,4,true)===bytes.length-8);
  while (p < bytes.length) {
    ensure(out.length < 65536, 'Too many container chunks'); const start=p;
    if (format==='jpeg') {
      ensure(bytes[p++]===255); while(bytes[p]===255) p++;
      range(bytes,p,1); const marker=bytes[p++]!;
      if (marker===0xda || marker===0xd9) { if(marker===0xda) { const n=u16(bytes,p); ensure(n>=2); range(bytes,p,n); ensure(bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217,'Missing JPEG end marker'); } else ensure(p===bytes.length,'Trailing JPEG data'); out.push({type:'tail',data:bytes.subarray(start),raw:bytes.subarray(start)}); return out; }
      ensure(marker>=0xc0 && marker!==0xd8 && !(marker>=0xd0&&marker<=0xd7));
      const n=u16(bytes,p); ensure(n>=2); range(bytes,p,n);
      out.push({type:marker.toString(16),data:bytes.subarray(p+2,p+n),raw:bytes.subarray(start,p+n)}); p+=n;
    } else {
      range(bytes,p,format==='png'?12:8);
      const n=u32(bytes,p+(format==='png'?0:4),format==='webp');
      const type=ascii(bytes.subarray(p+(format==='png'?4:0),p+(format==='png'?8:4)));
      const end=p+8+n+(format==='png'?4:n%2); range(bytes,p,end-p);
      if(format==='png') ensure(crc32(bytes.subarray(p+4,p+8+n))===u32(bytes,p+8+n),'PNG CRC mismatch');
      out.push({type,data:bytes.subarray(p+8,p+8+n),raw:bytes.subarray(p,end)}); p=end;
      if(format==='png' && type==='IEND') { ensure(n===0 && p===bytes.length); return out; }
    }
  }
  ensure(format==='webp','Missing image terminator'); return out;
}
export function chunk(type: string, data: Uint8Array, format: RasterFormat) {
  if(format==='jpeg') { ensure(data.length<=65533,'JPEG segment too large'); const h=new Uint8Array([255,parseInt(type,16),0,0]); new DataView(h.buffer).setUint16(2,data.length+2); return concat([h,data]); }
  const out=new Uint8Array(data.length+8+(format==='png'?4:data.length%2)); const v=new DataView(out.buffer);
  out.set(utf8(type),format==='png'?4:0); v.setUint32(format==='png'?0:4,data.length,format==='webp'); out.set(data,8);
  if(format==='png') v.setUint32(out.length-4,crc32(out.subarray(4,out.length-4))); return out;
}
export function assemble(original: Uint8Array, parts: Uint8Array[], format: RasterFormat) {
  if(format!=='webp') return concat([original.subarray(0,format==='jpeg'?2:8),...parts]);
  const out=concat([original.subarray(0,12),...parts]); new DataView(out.buffer).setUint32(4,out.length-8,true); return out;
}
