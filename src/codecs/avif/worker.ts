// This module is fetched only after an explicit availability probe or an AVIF encode request.
let ready:Promise<unknown>|undefined;
async function load() {
  // The dependency locates its binary with new URL('avif_enc.wasm', import.meta.url).
  // Let the module that owns the asset resolve it, rather than assuming a bundler-specific loader.
  ready??=(async()=> {
    const factory=(await import('@jsquash/avif/codec/enc/avif_enc.js')).default;
    return factory({noInitialRun:true});
  })(); return ready;
}
self.onmessage=async({data}:MessageEvent)=> {
  try {
    const module=await load() as {encode:(bytes:Uint8Array,width:number,height:number,options:unknown)=>Uint8Array|null};
    if(data.type==='probe') { self.postMessage({id:data.id,available:true}); return; }
    // Use the module directly to avoid initialising a second encoder through the wrapper.
    const {defaultOptions}=await import('@jsquash/avif/meta.js');
    const output=module.encode(new Uint8Array(data.bytes),data.width,data.height,{...defaultOptions,quality:Math.round((data.quality??.82)*100),qualityAlpha:100,speed:8});
    if(!output)throw new Error('AVIF encoding failed'); const buffer=output.slice().buffer; self.postMessage({id:data.id,buffer},[buffer]);
  } catch(error) { self.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)}); }
};
