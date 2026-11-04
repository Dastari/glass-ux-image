import type { OpenedImage, OpenImageOptions } from '../open-image.js';
import { createPixels, tileRect, type PixelBuffer, type TileAddress, type TileSource } from '../../core/index.js';
import type { ImportFormat } from './index.js';
import { decodeFormat } from './registry.js';
import { pixelLimit, type ImportInfo } from './decoder.js';
import { materialise } from './materialise.js';
class FormatWorkerStartupError extends Error {}
function resourceFailure(cause:unknown) {
  return cause instanceof RangeError||(cause instanceof Error&&(cause.name==='QuotaExceededError'||/out of memory|memory limit|allocation failed|resource exhausted|quota exceeded/i.test(cause.message)));
}
const makeWorker=()=>new Worker(new URL('./format-worker.js',import.meta.url),{type:'module'});
function transparent(size:{width:number;height:number}):TileSource {return {...size,readTile:tile=>{const r=tileRect(size,tile);return createPixels(r.width,r.height);}};}
type WorkerOpened=Pick<OpenedImage,'width'|'height'|'icc'|'metadata'|'importInfo'>&{importedLayers?:{spec:NonNullable<OpenedImage['importedLayers']>[number]['spec'];blob:Blob;width:number;height:number}[]};
async function here(blob:Blob,format:ImportFormat,options:OpenImageOptions):Promise<OpenedImage> {
  const decoded=await decodeFormat(blob,format,options);options.signal?.throwIfAborted();
  if(decoded.preview)return preview(decoded.preview,decoded.importInfo,options);
  return materialise(decoded,pixelLimit(options.maxPixels));
}
async function preview(bytes:Uint8Array,importInfo:ImportInfo,options:OpenImageOptions) {
  const {openImage}=await import('../open-image.js');const opened=await openImage(new Blob([bytes.slice()],{type:'image/jpeg'}),options);opened.importInfo=importInfo;return opened;
}
function inWorker(blob:Blob,format:ImportFormat,worker:Worker,options:OpenImageOptions):Promise<OpenedImage> {
  return new Promise((resolve,reject)=> {
    let dead=false,started=false,failure:unknown,next=0;
    const waiting=new Map<number,{resolve:(p:PixelBuffer)=>void;reject:(e:unknown)=>void;timer:ReturnType<typeof setTimeout>}>();
    const timer=setTimeout(()=>stop(new Error('Format worker decode timed out')),30_000);
    const stop=(cause:unknown)=>{if(dead)return;dead=true;failure=cause;clearTimeout(timer);worker.terminate();options.signal?.removeEventListener('abort',abort);reject(cause);for(const p of waiting.values()){clearTimeout(p.timer);p.reject(cause);}waiting.clear();};
    const abort=()=>stop(options.signal?.reason);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted){abort();return;}
    const source=(size:{width:number;height:number},index:number):TileSource=>({...size,readTile:(tile:TileAddress)=>new Promise((done,fail)=> {
      if(dead){fail(failure);return;}const id=next++,timer=setTimeout(()=>stop(new Error('Format worker did not return a tile')),10_000);waiting.set(id,{resolve:done,reject:fail,timer});
      try {worker.postMessage({id,source:index,tile});}catch(cause){stop(cause);}
    })});
    worker.onmessage=({data}:MessageEvent<{opened?:WorkerOpened;error?:string;id?:number;pixels?:PixelBuffer;preview?:Uint8Array;importInfo?:ImportInfo;ready?:boolean}>)=> {
      if(dead)return;
      // No untrusted bytes are sent until module startup has succeeded.
      if(data.ready){
        if(!started){started=true;try {worker.postMessage({blob,format,maxPixels:options.maxPixels});}catch(cause){stop(cause);}}return;
      }
      if(data.error){stop(new Error(data.error));return;}
      if(data.preview) {clearTimeout(timer);worker.terminate();options.signal?.removeEventListener('abort',abort);dead=true;void preview(data.preview,data.importInfo!,options).then(resolve,reject);return;}
      if(data.opened) {
        clearTimeout(timer);const opened:OpenedImage={...data.opened,...source(data.opened,0),importedLayers:data.opened.importedLayers?.map((l,i)=>({spec:l.spec,blob:l.blob,source:source(l,i+1)})),dispose:()=>stop(new Error('Image disposed')),idle:async()=>{if(dead)throw failure;}};
        if(opened.importedLayers?.length)opened.layerBase=transparent(opened);resolve(opened);return;
      }
      const pending=data.id===undefined?undefined:waiting.get(data.id);if(pending&&data.pixels){clearTimeout(pending.timer);waiting.delete(data.id!);pending.resolve(data.pixels);}else stop(new Error('Invalid format worker reply'));
    };
    worker.onerror=event=>{event.preventDefault();const cause=new Error(event.message);stop(started||resourceFailure(event.error)||resourceFailure(cause)?cause:new FormatWorkerStartupError(event.message));};
    worker.onmessageerror=()=>stop(new Error('Invalid format worker reply'));
  });
}
/** Lazy advanced import boundary. Decode, pyramid generation and PSD asset encoding run in a worker. */
export async function openFormat(blob:Blob,format:ImportFormat,options:OpenImageOptions):Promise<OpenedImage> {
  let opened:OpenedImage;
  if(format==='heif'&&options.loadHeif)opened=await here(blob,format,options);
  else {
    let worker:Worker|undefined;try {worker=(options.formatWorker??makeWorker)();}catch(cause) {if(resourceFailure(cause))throw cause; /* Strict worker policies use the validated local path. */ }
    try {opened=worker?await inWorker(blob,format,worker,options):await here(blob,format,options);}
    catch(error) {options.signal?.throwIfAborted();if(!(error instanceof FormatWorkerStartupError))throw error;opened=await here(blob,format,options);}
  }
  options.signal?.throwIfAborted();return Object.assign(opened,{originalBlob:blob});
}
