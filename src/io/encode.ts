import { writeImageDpi } from './metadata/resolution.js';
import { ensure } from './formats/bytes.js';
import { writeMetadata, type ImageMetadata } from './metadata/index.js';
import { writeIcc } from './metadata/icc.js';
/** Host-selected export settings. No output is saved or uploaded by this function. */
export interface EncodeOptions {
  /** Output MIME; optional AVIF is loaded only on demand. */
  type?: string;
  /** Lossy quality, from zero to one. */
  quality?: number;
  /** Fit within this longest edge, without enlargement. */
  maxEdge?: number;
  /** Exact output width, paired with height. */
  width?: number;
  /** Exact output height, paired with width. */
  height?: number;
  /** Physical print resolution in DPI for JPEG/PNG; does not change pixel dimensions. */
  dpi?:number;
  /** Retain transparency. JPEG always composites over white. Default true. */
  alpha?: boolean;
  /** Preserve metadata, strip everything or remove standard GPS properties. Default strip. */
  metadata?: 'preserve'|'strip'|'strip-gps';
  /** Source metadata, supplied by the session or a headless caller. */
  originalMetadata?: ImageMetadata;
  /** Explicit ICC bytes to embed; no pixel colour conversion is performed. */
  icc?: Uint8Array|null;
}
/** An unavailable or invalid encoder. */
export class ImageEncodeError extends Error { override name='ImageEncodeError'; }
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
  const {type='image/png',quality,maxEdge,alpha=true}=options;
  ensure(width>0&&height>0&&width*height<=64*1024*1024&&bytes.length===width*height*4,'Invalid output pixels');
  if(quality!==undefined)ensure(Number.isFinite(quality)&&quality>=0&&quality<=1,'Invalid quality');
  if(maxEdge!==undefined)ensure(Number.isFinite(maxEdge)&&maxEdge>=1,'Invalid maximum edge');
  const scale=maxEdge?Math.min(1,maxEdge/Math.max(width,height)):1;
  const w=options.width??Math.max(1,Math.round(width*scale)),h=options.height??Math.max(1,Math.round(height*scale));
  ensure(Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&w*h<=64*1024*1024,'Invalid export dimensions');
  const source=new OffscreenCanvas(width,height),context=source.getContext('2d')!;
  context.putImageData(new ImageData(bytes as ImageDataArray,width,height),0,0);
  const output=new OffscreenCanvas(w,h),ctx=output.getContext('2d')!;
  if(!alpha||type==='image/jpeg') {ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
  ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,w,h);
  let blob=await output.convertToBlob({type,...(quality===undefined?{}:{quality})});
  if(blob.type!==type&&type==='image/avif') {
    try { const codec=(await import('../codecs/avif.js')).avifEncoder(); blob=await codec.encode(ctx.getImageData(0,0,w,h).data,w,h,quality); }
    catch(cause) {throw new ImageEncodeError('AVIF is unavailable',{cause});}
  }
  if(blob.type!==type)throw new ImageEncodeError(`This browser cannot write ${type}`);
  if(type==='image/avif') {
    if((options.metadata&&options.metadata!=='strip')||options.icc)throw new ImageEncodeError('AVIF metadata embedding is not available');
    return blob;
  }
  let data:Uint8Array=new Uint8Array(await blob.arrayBuffer());
  if(options.originalMetadata)data=writeMetadata(data,options.originalMetadata,{mode:options.metadata??'strip',pixelsOriented:true});
  if(options.icc!==undefined)data=await writeIcc(data,options.icc);
  if(options.dpi!==undefined)data=writeImageDpi(data,options.dpi);
  return new Blob([data.slice()],{type});
}
