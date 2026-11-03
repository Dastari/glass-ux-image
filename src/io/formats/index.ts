import { ascii, bounded, ensure, FileDataError, range, u16, utf8 } from './bytes.js';
export { FileDataError } from './bytes.js';
export type ImportFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg';
/** Byte signatures, never a filename or caller-supplied MIME type. SVG still requires sanitisation. */
export function sniffFormat(bytes: Uint8Array): ImportFormat {
  bounded(bytes);
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'jpeg';
  if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'png';
  if(ascii(bytes.subarray(0,4))==='RIFF' && ascii(bytes.subarray(8,12))==='WEBP') return 'webp';
  if(['GIF87a','GIF89a'].includes(ascii(bytes.subarray(0,6)))) return 'gif';
  const text=new TextDecoder().decode(bytes.subarray(0,4096)).replace(/^\uFEFF/,'').trimStart();
  if(/^(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|\/?>)/i.test(text)) return 'svg';
  throw new FileDataError('unsupported','Unrecognised image format');
}
/** Counts image descriptors, not byte occurrences. Importers render frame zero only. */
export function gifFrameCount(bytes: Uint8Array) {
  bounded(bytes); ensure(sniffFormat(bytes)==='gif'); range(bytes,0,13); let p=13, frames=0;
  if(bytes[10]!&128) p+=3*(1<<((bytes[10]!&7)+1)); range(bytes,0,p);
  const skip=()=> { for (;;) { range(bytes,p,1); const n=bytes[p++]!; if(!n) return; range(bytes,p,n); p+=n; } };
  while(p<bytes.length) {
    const code=bytes[p++]!;
    if(code===0x3b) { ensure(frames>0 && p===bytes.length); return frames; }
    if(code===0x21) { range(bytes,p++,1); skip(); }
    else { ensure(code===0x2c); range(bytes,p,9); const packed=bytes[p+8]!; ensure(u16(bytes,p+4,true)>0&&u16(bytes,p+6,true)>0); p+=9; if(packed&128) p+=3*(1<<((packed&7)+1)); range(bytes,p,1); p++; skip(); frames++; }
  }
  throw new FileDataError('invalid','Missing GIF trailer');
}
export interface NativeEncoder { encode(type: string): Promise<Blob> }
/** Probes actual output MIME: unsupported canvas formats silently become PNG. No AVIF assumption. */
export async function nativeEncodeSupport(encoder: NativeEncoder): Promise<Record<string,boolean>> {
  const results=await Promise.all(['image/png','image/jpeg','image/webp','image/avif'].map(async type=> { try { return [type,(await encoder.encode(type)).type===type] as const; } catch { return [type,false] as const; } }));
  return Object.fromEntries(results);
}
/** Static SVG policy: 1 MiB XML, 10,000 nodes (browser adapter), 8192 px per edge,
 * 16 megapixels total. Explicit host dimensions override intrinsic size. Scripts, CSS,
 * images, links, animation, foreignObject, DTDs and external resources are rejected. */
export const SVG_MAX_BYTES = 1024*1024;
/** Maximum rasterised SVG edge in pixels. */
export const SVG_MAX_EDGE = 8192;
/** Maximum rasterised SVG pixel allocation. */
export const SVG_MAX_PIXELS = 16*1024*1024;
/** Strict static SVG subset. Rebuilds a fresh document: no script, CSS, links, images or animation. */
export interface SvgBoundary {
  sanitise(text: string): string;
  rasterise(svg: Blob, width: number, height: number): Promise<Blob>;
}
/** Sanitise SVG, enforce raster limits and rasterise it without inserting untrusted markup into the host DOM. */
export async function rasteriseSvg(bytes: Uint8Array, width: number, height: number, boundary: SvgBoundary): Promise<Blob> {
  bounded(bytes,SVG_MAX_BYTES); ensure(sniffFormat(bytes)==='svg');
  ensure(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=SVG_MAX_EDGE&&height<=SVG_MAX_EDGE&&width*height<=SVG_MAX_PIXELS,'SVG raster size exceeds policy');
  return boundary.rasterise(new Blob([utf8(boundary.sanitise(new TextDecoder().decode(bytes)))] ,{type:'image/svg+xml'}),width,height);
}
