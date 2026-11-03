import { ensure } from '../formats/bytes.js';
/** Per-source transformations passed unchanged to the injected renderer. */
export interface BatchSettings<Recipe=unknown> {
  /** Plain edit recipe, independent of a session implementation. */
  recipe?:Recipe;
  /** Requested output width in pixels. */
  width?:number;
  /** Requested output height in pixels. */
  height?:number;
  /** Output MIME type. */
  format?:string;
  /** Lossy quality from zero to one. */
  quality?:number;
  /** Retain transparency when the output supports it. */
  alpha?:boolean;
  /** Source metadata policy. */
  metadata?:'preserve'|'strip'|'strip-gps';
}
export type BatchResult<Output> = {index:number;status:'fulfilled';value:Output}|{index:number;status:'rejected';error:unknown}|{index:number;status:'aborted';error:unknown};
export interface BatchProgress<Output> { completed:number; total:number; result:BatchResult<Output> }
export interface BatchOptions<Source,Output,Recipe=unknown> {
  concurrency?:number; signal?:AbortSignal; settings:BatchSettings<Recipe>;
  renderOne(source:Source,settings:BatchSettings<Recipe>,context:{signal?:AbortSignal;index:number}):Promise<Output>;
  onProgress?:(progress:BatchProgress<Output>)=>void;
  /** Progress observers cannot interrupt the batch. Their failures are reported here. */
  onObserverError?:(error:unknown)=>void;
}
/** Ordered results; individual failures never stop remaining files. No rendering/session dependency. */
export async function runBatch<S,O,R=unknown>(sources:readonly S[],options:BatchOptions<S,O,R>):Promise<BatchResult<O>[]> {
  const concurrency=options.concurrency??2; ensure(Number.isInteger(concurrency)&&concurrency>0&&concurrency<=64,'Invalid batch concurrency');
  ensure(sources.length<=100000,'Too many batch sources');
  const {width,height,quality}=options.settings;
  for(const n of [width,height]) if(n!==undefined) ensure(Number.isInteger(n)&&n>0&&n<=65536,'Invalid batch dimensions');
  if(quality!==undefined) ensure(Number.isFinite(quality)&&quality>=0&&quality<=1,'Invalid batch quality');
  const results:BatchResult<O>[]=Array.from({length:sources.length}) as BatchResult<O>[]; let next=0,completed=0;
  const settings=structuredClone(options.settings);
  const worker=async()=> { while(next<sources.length) {
    const index=next++; let result:BatchResult<O>;
    if(options.signal?.aborted) result={index,status:'aborted',error:options.signal.reason};
    else try { const value=await options.renderOne(sources[index]!,structuredClone(settings),{index,signal:options.signal}); result=options.signal?.aborted?{index,status:'aborted',error:options.signal.reason}:{index,status:'fulfilled',value}; }
    catch(error) { result={index,status:options.signal?.aborted?'aborted':'rejected',error}; }
    results[index]=result; completed++;
    try { options.onProgress?.({completed,total:sources.length,result}); } catch(error) { try { options.onObserverError?.(error); } catch { /* Observers do not control rendering. */ } }
  } };
  await Promise.all(Array.from({length:Math.min(concurrency,sources.length)},worker)); return results;
}
