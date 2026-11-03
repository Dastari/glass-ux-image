import { bounded, ensure, FileDataError } from './bytes.js';
import { gifFrameCount, rasteriseSvg, sniffFormat, type SvgBoundary } from './index.js';
import { readMetadata, type ImageMetadata } from '../metadata/index.js';
export interface ImportDecoder<Decoded> {
  /** Must apply embedded EXIF orientation exactly once, decode frame zero, enforce maxPixels. */
  decode(blob:Blob,options:{orientation:'from-image';frameIndex:0;maxPixels:number}):Promise<Decoded>;
}
export interface ImportOptions<Decoded> {
  decoder:ImportDecoder<Decoded>; maxPixels?:number;
  svg?: {boundary:SvgBoundary;width:number;height:number};
}
/** Prepared data is returned to the host; no session is opened and no source is persisted. */
export async function importFile<Decoded>(bytes:Uint8Array,options:ImportOptions<Decoded>) {
  bounded(bytes); const format=sniffFormat(bytes),maxPixels=options.maxPixels??16*1024*1024;
  ensure(Number.isInteger(maxPixels)&&maxPixels>0&&maxPixels<=64*1024*1024,'Invalid decoded pixel limit');
  let metadata:ImageMetadata|undefined,blob:Blob;
  if(format==='svg') { if(!options.svg) throw new FileDataError('unsupported','SVG requires an explicit rasterisation boundary and dimensions'); ensure(options.svg.width*options.svg.height<=maxPixels); blob=await rasteriseSvg(bytes,options.svg.width,options.svg.height,options.svg.boundary); }
  else { if(format!=='gif') metadata=readMetadata(bytes); blob=new Blob([bytes.slice()],{type:`image/${format}`}); }
  const frameCount=format==='gif'?gifFrameCount(bytes):1;
  try { const decoded=await options.decoder.decode(blob,{orientation:'from-image',frameIndex:0,maxPixels}); return {format,frameCount,metadata,decoded,orientationApplied:true as const}; }
  catch(cause) { if(cause instanceof FileDataError) throw cause; throw new FileDataError('invalid','Image decoding failed',{cause}); }
}
/** Browser-native raster decoder. Native allocation occurs before dimensions can be checked. */
export function browserImportDecoder():ImportDecoder<ImageBitmap> {
  return { async decode(blob,{maxPixels}) { const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'}); if(bitmap.width*bitmap.height>maxPixels) { bitmap.close(); throw new FileDataError('limit','Decoded image exceeds the pixel limit'); } return bitmap; } };
}
