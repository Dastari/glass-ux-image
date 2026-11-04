import { sniffFormat } from './formats/index.js';
import { ensure, MAX_FILE_BYTES } from './formats/bytes.js';
import { prepareImage } from './prepare.js';
import { type PixelBuffer, type Size, type TileAddress, type TileSource } from "../core/index.js";
import { createColourPyramid } from './colour/index.js';
import type { WorkerRequest } from "./image-worker.js";

/** A decoded source retaining the original bytes and import information. */
export interface OpenedImage extends TileSource {
  /** Release decoder resources and reject pending reads. Safe to call repeatedly. */
  dispose?: () => void;
  /** Unmodified host source, absent for procedural tile sources. */
  originalBlob?:Blob;
  /** Metadata parsed from the original source. */
  metadata?:import('./metadata/index.js').ImageMetadata;
  /** Embedded source profile and the engine's conversion support. */
  icc?:import('./metadata/icc.js').IccProfile|null;
  /** Format provenance; RAW sources are embedded JPEG previews, never demosaiced sensor data. */
  importInfo?:import('./formats/decoder.js').ImportInfo;
  /** PSD raster layers, bottom first, with original-profile lossless raster assets for project files. */
  importedLayers?:readonly {spec:Omit<import('../core/index.js').LayerSpec,'asset'>;blob:Blob;source:TileSource}[];
  /** Transparent PSD session base. Headless consumers still read the saved composite by default. */
  layerBase?:TileSource;
  /** GIF image descriptors; only frame zero is decoded. */
  frameCount?:number;
}
export type ImageInput = Blob | string | TileSource;

export interface OpenImageOptions {
  signal?: AbortSignal;
  /** Maximum decoded pixels; checked from raster headers before allocation. */
  maxPixels?: number;
  /** Optional HEIF peer adapter loaded by the host with a dynamic import. No HEVC code is bundled. */
  loadHeif?:()=>Promise<import('./formats/decoder.js').HeifDecoderModule>;
  /** Makes the advanced-format worker. Override for bundler/CSP worker policies. */
  formatWorker?:()=>Worker;
  /** Makes the decoding worker. Override it if your bundler needs a different worker URL. */
  worker?: () => Worker;
}

/** An image that will not open. `cause` holds the browser's own error. */
export class ImageOpenError extends Error {
  override name = "ImageOpenError";
}

/** The worker itself failed, so the image may still open on this thread. */
class WorkerError extends Error {}

const defaultWorker = () => new Worker(new URL("./image-worker.js", import.meta.url), { type: "module" });

const isSource = (input: ImageInput): input is TileSource => typeof input === "object" && "readTile" in input;

/** Without workers (a strict policy, say), decode here. Slower to open, the same result. */
async function openHere(blob: Blob,icc?:OpenedImage['icc']): Promise<TileSource> {
  const bitmap = await createImageBitmap(blob,{imageOrientation:'from-image',colorSpaceConversion:'none'});
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const size = { width, height };
  const pyramid = createColourPyramid(context.getImageData(0, 0, width, height).data, size,icc);
  return { ...size, readTile: (tile) => pyramid.readTile(tile) };
}

function openInWorker(blob:Blob,worker:Worker,signal?:AbortSignal,maxPixels?:number) {
  return new Promise<OpenedImage>((resolve,reject)=> {
    type Pending={resolve:(pixels:PixelBuffer)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>};
    const waiting=new Map<number,Pending>();let next=0,dead=false,failure:unknown;
    const startup=setTimeout(()=>stop(new WorkerError('Image worker did not finish opening')),10_000);
    const stop=(error:unknown)=> {
      if(dead)return;dead=true;failure=error;clearTimeout(startup);worker.terminate();
      signal?.removeEventListener('abort',abort);reject(error);
      for(const pending of waiting.values()){clearTimeout(pending.timer);pending.reject(error);}waiting.clear();
    };
    const abort=()=>stop(signal?.reason);
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=event=>{event.preventDefault();stop(new WorkerError(event.message));};
    worker.onmessageerror=()=>stop(new WorkerError('Image worker reply could not be read'));
    worker.onmessage=({data}:MessageEvent)=> {
      if(dead)return;
      try {
        if(data.type==='opened') {
          clearTimeout(startup);
          const size:Size={width:data.width,height:data.height};
          ensure(Number.isInteger(size.width)&&Number.isInteger(size.height)&&size.width>0&&size.height>0,'Invalid worker image size');
          resolve({...size,dispose:()=>stop(new ImageOpenError("Image disposed")),metadata:data.metadata,icc:data.icc,frameCount:data.frameCount,
            idle:async()=>{if(dead)throw failure;},
            readTile:(tile:TileAddress)=>new Promise<PixelBuffer>((done,fail)=> {
              if(dead){fail(failure);return;}
              const id=next++,timer=setTimeout(()=>stop(new WorkerError('Image worker did not return a tile')),10_000);
              waiting.set(id,{resolve:done,reject:fail,timer});
              try {worker.postMessage({type:'tile',id,tile} satisfies WorkerRequest);}catch(cause){stop(new WorkerError('Image worker request failed',{cause}));}
            })});
        } else if(data.type==='failed')stop(new ImageOpenError(data.message));
        else if(data.type==='tile') {
          const pending=waiting.get(data.id);if(!pending)return;
          clearTimeout(pending.timer);waiting.delete(data.id);pending.resolve(data.pixels);
        } else stop(new WorkerError('Unexpected image worker reply'));
      } catch(cause) {stop(new WorkerError('Invalid image worker reply',{cause}));}
    };
    try {worker.postMessage({type:'open',blob,maxPixels} satisfies WorkerRequest);}catch(cause){stop(new WorkerError('Image worker request failed',{cause}));}
  });
}

/**
 * Turn a file, blob or URL into a tile source. A URL is fetched as is: authentication and CORS are
 * the host's, so pass a blob if the image needs either. Any browser-decodable format works.
 */
export async function openImage(input: ImageInput, options: OpenImageOptions = {}): Promise<OpenedImage> {
  options.signal?.throwIfAborted();
  if (isSource(input)) return input;
  const { signal, worker = defaultWorker } = options;
  let blob: Blob;
  try {
    if (typeof input === "string") {
      const response = await fetch(input, signal ? { signal } : {});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      blob = await response.blob();
    } else blob = input;
  } catch (cause) {
    if (signal?.aborted) throw signal.reason;
    throw new ImageOpenError("The image could not be fetched", { cause });
  }
  ensure(blob.size<=MAX_FILE_BYTES,'Image exceeds byte limit');
  const format=sniffFormat(new Uint8Array(await blob.slice(0,4096).arrayBuffer()));
  // Raster header/metadata parsing runs beside native decoding in the worker. SVG's small,
  // strictly capped DOM sanitisation boundary must run here before any browser sees its XML.
  if(['tiff','psd','raw','heif'].includes(format)) {
    try {
      const {openFormat}=await import('./formats/open-format.js');
      return await openFormat(blob,format,options);
    } catch(cause) {if(signal?.aborted)throw signal.reason;throw new ImageOpenError('The image could not be decoded',{cause});}
  }
  const prepared=format==='svg'?await prepareImage(blob,options.maxPixels):undefined;
  signal?.throwIfAborted();
  let source:OpenedImage;
  try {
    source=await openInWorker(prepared?.decodeBlob??blob,worker(),signal,options.maxPixels);
  } catch(cause) {
    if(signal?.aborted)throw signal.reason;
    if(cause instanceof ImageOpenError)throw cause;
    try {const safe=prepared??await prepareImage(blob,options.maxPixels);source=Object.assign(await openHere(safe.decodeBlob,safe.icc),{metadata:safe.metadata,icc:safe.icc,frameCount:safe.frameCount});}
    catch(error) {throw new ImageOpenError('The image could not be decoded',{cause:error});}
  }
  signal?.throwIfAborted();
  return Object.assign(source,{originalBlob:blob});
}
