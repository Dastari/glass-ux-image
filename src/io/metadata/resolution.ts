import { ascii, ensure, u16, u32, utf8 } from '../formats/bytes.js';
import { assemble, chunk, chunks } from '../formats/container.js';
import { sniffFormat } from '../formats/index.js';
import { readExifDpi, writeExifDpi } from './tiff.js';
/** Physical print resolution; changing it does not resample pixels. */
export interface ImageDpi {
  /** Horizontal dots per inch. */
  x:number;
  /** Vertical dots per inch. */
  y:number;
}
/** Read EXIF/JFIF JPEG or PNG pHYs resolution. PNG's integer pixels/metre can round DPI. */
export function readImageDpi(bytes:Uint8Array):ImageDpi|null {
  const format=sniffFormat(bytes);if(format!=='jpeg'&&format!=='png'&&format!=='webp')return null;
  const parts=chunks(bytes,format);
  for(const part of parts) {
    const exif=format==='jpeg'?part.type==='e1'&&ascii(part.data.subarray(0,6))==='Exif\0\0':part.type===(format==='png'?'eXIf':'EXIF');
    if(exif) {const data=ascii(part.data.subarray(0,6))==='Exif\0\0'?part.data.subarray(6):part.data;const dpi=readExifDpi(data);if(dpi)return dpi;}
  }
  if(format==='png') {const phys=parts.find(p=>p.type==='pHYs');if(phys) {ensure(phys.data.length===9);if(phys.data[8]===1)return {x:u32(phys.data,0)*.0254,y:u32(phys.data,4)*.0254};}}
  if(format==='jpeg') {const jfif=parts.find(p=>p.type==='e0'&&ascii(p.data.subarray(0,5))==='JFIF\0');if(jfif) {ensure(jfif.data.length>=14);const unit=jfif.data[7];if(unit===1||unit===2) {const scale=unit===1?1:2.54;return {x:u16(jfif.data,8)*scale,y:u16(jfif.data,10)*scale};}}}
  return null;
}
/** Set JFIF and any retained EXIF in JPEG, or pHYs and retained EXIF in PNG.
 * Does not add EXIF to a stripped export. WebP only updates retained EXIF; AVIF is unsupported.
 */
export function writeImageDpi(bytes:Uint8Array,dpi:number):Uint8Array {
  ensure(Number.isFinite(dpi)&&dpi>=1&&dpi<=65535,'DPI must be between 1 and 65535');
  const format=sniffFormat(bytes);if(format!=='jpeg'&&format!=='png'&&format!=='webp')return bytes;
  const parts=chunks(bytes,format);
  const updated=parts.map(part=> {
    const prefix=ascii(part.data.subarray(0,6))==='Exif\0\0';
    if((format==='jpeg'&&part.type==='e1'&&prefix)||(format==='png'&&part.type==='eXIf')||(format==='webp'&&part.type==='EXIF')) {
      const exif=writeExifDpi(prefix?part.data.subarray(6):part.data,dpi);
      const data=prefix?new Uint8Array(6+exif.length):exif;if(prefix){data.set(utf8('Exif\0\0'));data.set(exif,6);}
      return {...part,raw:chunk(part.type,data,format)};
    }
    return part;
  });
  if(format==='png') {const data=new Uint8Array(9),v=new DataView(data.buffer);v.setUint32(0,Math.round(dpi/.0254));v.setUint32(4,Math.round(dpi/.0254));data[8]=1;
    const clean=updated.filter(p=>p.type!=='pHYs');return assemble(bytes,[clean[0]!.raw,chunk('pHYs',data,format),...clean.slice(1).map(p=>p.raw)],format);
  }
  if(format==='jpeg') {const original=updated.find(p=>p.type==='e0'&&ascii(p.data.subarray(0,5))==='JFIF\0');
    const data=original?original.data.slice():new Uint8Array(14);ensure(data.length>=14);if(!original){data.set(utf8('JFIF\0'));data[5]=1;data[6]=2;}
    data[7]=1;const view=new DataView(data.buffer,data.byteOffset,data.byteLength);view.setUint16(8,Math.round(dpi));view.setUint16(10,Math.round(dpi));
    return assemble(bytes,[chunk('e0',data,format),...updated.filter(p=>!(p.type==='e0'&&ascii(p.data.subarray(0,5))==='JFIF\0')).map(p=>p.raw)],format);
  }
  return assemble(bytes,updated.map(p=>p.raw),format);
}
