/** An optional AVIF encoder which could not load (including a host CSP refusal). */
export class AvifUnavailableError extends Error { override name='AvifUnavailableError'; }
async function hostAllowsWasm() {
  try { await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));return true; } catch {return false;}
}
interface Reply {id:number;error?:string;buffer?:ArrayBuffer;available?:boolean}
/** A lazy worker codec. Constructing it does not fetch or compile WASM. */
export class AvifEncoder {
  #worker?:Worker; #next=0; #waiting=new Map<number,{resolve:(reply:Reply)=>void;reject:(error:unknown)=>void}>();
  /** Override the worker factory for a bundler or a host policy. */
  constructor(private readonly makeWorker=()=>new Worker(new URL('./avif/worker.js',import.meta.url),{type:'module'})) {}
  #request(message:object):Promise<Reply> {
    return new Promise((resolve,reject)=> {
      try { if(!this.#worker) { this.#worker=this.makeWorker(); this.#worker.onmessage=({data}:MessageEvent<Reply>)=> { const pending=this.#waiting.get(data.id); this.#waiting.delete(data.id); if(data.error)pending?.reject(new AvifUnavailableError(data.error)); else pending?.resolve(data); }; this.#worker.onerror=()=>this.dispose(); }
        const id=++this.#next; const timer=(message as {type?:string}).type==='probe'?setTimeout(()=>{this.#waiting.delete(id);reject(new AvifUnavailableError('AVIF availability probe timed out'));},10_000):undefined;
        this.#waiting.set(id,{resolve:reply=>{clearTimeout(timer);resolve(reply);},reject:error=>{clearTimeout(timer);reject(error);}}); this.#worker.postMessage({...message,id});
      } catch(cause) { reject(new AvifUnavailableError('AVIF codec could not load',{cause})); }
    });
  }
  /** Compiles the actual module. False covers missing assets, workers and strict CSP. */
  async available():Promise<boolean> { try { if(!await hostAllowsWasm())return false;return !!(await this.#request({type:'probe'})).available; } catch { return false; } }
  /** Encode straight sRGB RGBA bytes. Call available before offering this format. */
  async encode(bytes:Uint8ClampedArray,width:number,height:number,quality?:number):Promise<Blob> { if(!await hostAllowsWasm())throw new AvifUnavailableError('AVIF is unavailable under the host policy');const reply=await this.#request({type:'encode',bytes:bytes.slice().buffer,width,height,quality}); if(!reply.buffer)throw new AvifUnavailableError('AVIF encoder returned no data'); return new Blob([reply.buffer],{type:'image/avif'}); }
  /** Release the worker and reject pending requests. */
  dispose() { this.#worker?.terminate(); this.#worker=undefined; for(const p of this.#waiting.values())p.reject(new AvifUnavailableError('AVIF worker stopped')); this.#waiting.clear(); }
}
let shared:AvifEncoder|undefined;
/** A shared lazy codec; nothing is loaded until availability or encoding is requested. */
export function avifEncoder() { return shared??=new AvifEncoder(); }
