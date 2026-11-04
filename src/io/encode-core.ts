import { writeImageDpi } from './metadata/resolution.js';
import { ensure } from './formats/bytes.js';
import { writeMetadata, type ImageMetadata } from './metadata/index.js';
import { writeIcc } from './metadata/icc.js';
import { srgbProfile } from './colour/srgb.js';
// Static: the conversion maths is already in every bundle that decodes, and a dynamic import of a module the eager
// graph also holds lets the bundler fold shared modules into lazy chunks.
import { profileConversion } from './colour/profile.js';
import { pixelsFromRgba8, type PixelBuffer } from '../core/pixels.js';
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
  /** Convert to and embed this RGB matrix/TRC profile, resizing and compositing in linear sRGB first. Default: embed sRGB. Null: untagged sRGB. */
  icc?: Uint8Array|null;
}
/** An unavailable or invalid encoder. */
export class ImageEncodeError extends Error { override name='ImageEncodeError'; }
/**
 * @internal AVIF support, supplied by `encode.ts`. Kept out of this module so code that only writes PNG, JPEG
 * or WebP (Fill edges, flatten) never reaches the AVIF codec, even as a lazy chunk.
 */
export interface AvifSupport {
  encode(bytes:Uint8ClampedArray,width:number,height:number,quality?:number):Promise<Blob>;
  writeMetadata(data:Uint8Array,metadata:ImageMetadata|undefined,policy:{mode:'preserve'|'strip'|'strip-gps';pixelsOriented:boolean},profile:Uint8Array|null):Uint8Array;
}
/** @internal Encode with the browser's own encoders: PNG, JPEG and WebP. */
export async function encodeRasterImage(bytes:Uint8ClampedArray,width:number,height:number,options:EncodeOptions={}):Promise<Blob> {
  return encodePreparedImage(bytes,width,height,options);
}
/** @internal Encode, with AVIF when `avif` is given. */
export async function encodePreparedImage(input:Uint8ClampedArray|PixelBuffer,width:number,height:number,options:EncodeOptions,avif?:()=>Promise<AvifSupport>):Promise<Blob> {
  const {type='image/png',quality,maxEdge,alpha=true}=options;
  const working = !(input instanceof Uint8ClampedArray);
  ensure(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width*height<=64*1024*1024&&(working?input.data.length:input.length)===width*height*4,'Invalid output pixels');
  if(working)ensure(input.width===width&&input.height===height,'Invalid output pixels');
  if(quality!==undefined)ensure(Number.isFinite(quality)&&quality>=0&&quality<=1,'Invalid quality');
  if(maxEdge!==undefined)ensure(Number.isFinite(maxEdge)&&maxEdge>=1,'Invalid maximum edge');
  const scale=maxEdge?Math.min(1,maxEdge/Math.max(width,height)):1;
  const w=options.width??Math.max(1,Math.round(width*scale)),h=options.height??Math.max(1,Math.round(height*scale));
  ensure(Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&w*h<=64*1024*1024,'Invalid export dimensions');
  const output=new OffscreenCanvas(w,h),ctx=output.getContext('2d')!;
  if(options.icc||working) {
    const {prepareExportPixels,encodeExportPixels}=await import('./colour/prepare-export.js');
    const transform=options.icc?profileConversion(options.icc).transform:undefined;
    if(options.icc&&!transform)throw new ImageEncodeError('The destination ICC profile is not a supported RGB matrix/TRC profile');
    const pixels=await prepareExportPixels(working?input:pixelsFromRgba8(input,width,height),w,h,!alpha||type==='image/jpeg');
    const bytes=await encodeExportPixels(pixels,transform??undefined);
    // The canvas is only a byte encoder here: it must never resize or composite profile samples.
    ctx.putImageData(new ImageData(bytes as ImageDataArray,w,h),0,0);
  } else {
    const source=new OffscreenCanvas(width,height),context=source.getContext('2d')!;
    context.putImageData(new ImageData(input as ImageDataArray,width,height),0,0);
    if(!alpha||type==='image/jpeg') {ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
    ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,w,h);
  }
  let blob=await output.convertToBlob({type,...(quality===undefined?{}:{quality})});
  if(blob.type!==type&&type==='image/avif'&&avif) {
    try { blob=await (await avif()).encode(ctx.getImageData(0,0,w,h).data,w,h,quality); }
    catch(cause) {throw new ImageEncodeError('AVIF is unavailable',{cause});}
  }
  if(blob.type!==type)throw new ImageEncodeError(`This browser cannot write ${type}`);
  const profile=options.icc===undefined?srgbProfile():options.icc;
  let data:Uint8Array=new Uint8Array(await blob.arrayBuffer());
  if(type==='image/avif'&&avif) {
    data=(await avif()).writeMetadata(data,options.originalMetadata,{mode:options.metadata??'strip',pixelsOriented:true},profile);
    return new Blob([data.slice()],{type});
  }
  if(options.originalMetadata)data=writeMetadata(data,options.originalMetadata,{mode:options.metadata??'strip',pixelsOriented:true});
  data=await writeIcc(data,profile);
  if(options.dpi!==undefined)data=writeImageDpi(data,options.dpi);
  return new Blob([data.slice()],{type});
}
