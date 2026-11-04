import { encodePreparedImage, type AvifSupport, type EncodeOptions } from './encode-core.js';
import type { PixelBuffer } from '../core/pixels.js';
export { ImageEncodeError, type EncodeOptions } from './encode-core.js';

/** AVIF loads only when a caller asks for it. */
const avif=async():Promise<AvifSupport>=>{
  const [{avifEncoder},{writeAvifMetadata}]=await Promise.all([import('../codecs/avif.js'),import('./metadata/avif.js')]);
  const codec=avifEncoder();
  return {encode:(bytes,width,height,quality)=>codec.encode(bytes,width,height,quality),writeMetadata:writeAvifMetadata};
};
/** Probe actual codecs before offering formats; optional AVIF failure returns false. */
export async function exportFormatSupport():Promise<Record<string,boolean>> {
  const result:Record<string,boolean>={};const probe=new OffscreenCanvas(1,1);probe.getContext('2d');
  for(const type of ['image/png','image/jpeg','image/webp','image/avif']) {
    try { result[type]=(await probe.convertToBlob({type})).type===type; } catch {result[type]=false;}
  }
  if(!result['image/avif'])try { result['image/avif']=await (await import('../codecs/avif.js')).avifEncoder().available(); } catch { result['image/avif']=false; }
  return result;
}
/** Encode straight-alpha sRGB bytes, then apply the host's explicit metadata/profile policy. */
export async function encodeImage(bytes:Uint8ClampedArray,width:number,height:number,options:EncodeOptions={}):Promise<Blob> {
  return encodePreparedImage(bytes,width,height,options,avif);
}
/** @internal Session working floats; resize/composite precede destination profile conversion. */
export async function encodeWorkingImage(pixels:PixelBuffer,options:EncodeOptions):Promise<Blob> {
  return encodePreparedImage(pixels,pixels.width,pixels.height,options,avif);
}
