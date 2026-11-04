import type { LayerSpec, Size } from '../../core/index.js';
import type { IccProfile } from '../metadata/icc.js';
import type { ImageMetadata } from '../metadata/index.js';
/** Import provenance is plain data so hosts can label preview-only sources. */
export interface ImportInfo {kind:'tiff'|'psd'|'raw-preview'|'heif';pageCount?:number;warnings?:string[]}
export interface DecodedRaster extends Size {rgba:Uint8Array;icc?:IccProfile|null;metadata?:ImageMetadata;orientation?:number}
export interface DecodedLayer extends DecodedRaster {spec:Omit<LayerSpec,'asset'>}
export interface DecodedFormat extends DecodedRaster {importInfo:ImportInfo;layers?:DecodedLayer[];preview?:Uint8Array}
/** Host peer adapter. Supply `loadHeif: () => import('your-heif-peer-adapter')`; no HEVC code ships here. */
export interface HeifDecoderModule {decode(blob:Blob,options:{maxPixels:number;signal?:AbortSignal}):Promise<DecodedRaster>}
export interface FormatDecodeOptions {maxPixels?:number;signal?:AbortSignal;loadHeif?:()=>Promise<HeifDecoderModule>}
export const DEFAULT_MAX_PIXELS=64*1024*1024;
export function pixelLimit(value=DEFAULT_MAX_PIXELS) {
  if(!Number.isSafeInteger(value)||value<1||value>DEFAULT_MAX_PIXELS)throw new RangeError('Invalid pixel limit');return value;
}
export function validateRaster(size:Size,maxPixels:number) {
  if(!Number.isSafeInteger(size.width)||!Number.isSafeInteger(size.height)||size.width<1||size.height<1||size.width*size.height>maxPixels)throw new RangeError('Image exceeds pixel limit');
}
