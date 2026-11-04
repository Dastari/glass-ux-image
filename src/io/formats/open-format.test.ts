import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { openImage } from '../open-image.js';
const fixture=()=>new Blob([new Uint8Array(readFileSync(new URL('../../../e2e/fixtures/imports/rgba8.tif',import.meta.url)))]);
function worker() {return {terminate:vi.fn(),postMessage:vi.fn(),onmessage:undefined as undefined|((e:{data:unknown})=>void),onerror:undefined as undefined|((e:{message:string;preventDefault():void})=>void),onmessageerror:undefined as undefined|(()=>void)};}
function readyWorker(w:ReturnType<typeof worker>) {return ()=>{queueMicrotask(()=>w.onmessage!({data:{ready:true}}));return w as unknown as Worker;};}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('advanced format worker failure uses validated local fallback',async()=> {
 const w=worker();const startup=()=>{queueMicrotask(()=>w.onerror!({message:'blocked by policy',preventDefault(){}}));return w as unknown as Worker;};
 const source=await openImage(fixture(),{formatWorker:startup});expect(source.width).toBe(3);expect(w.terminate).toHaveBeenCalledOnce();expect(w.postMessage).not.toHaveBeenCalled();expect((await source.readTile({level:0,x:0,y:0})).data.slice(0,4)).toEqual(new Float32Array([1,0,0,1]));
});
it('advanced format source disposal rejects pending and future tile reads',async()=> {
 const w=worker();w.postMessage.mockImplementation((...args:unknown[])=>{if('blob' in (args[0] as object))queueMicrotask(()=>w.onmessage!({data:{opened:{width:3,height:2,importInfo:{kind:'tiff'}}}}));});
 const source=await openImage(fixture(),{formatWorker:readyWorker(w)});const pending=source.readTile({level:0,x:0,y:0});source.dispose!();source.dispose!();await expect(pending).rejects.toThrow('disposed');await expect(source.readTile({level:0,x:0,y:0})).rejects.toThrow('disposed');expect(w.terminate).toHaveBeenCalledOnce();
});
it('abort terminates advanced decoding and preserves the host abort reason',async()=> {
 const w=worker(),controller=new AbortController(),reason=new Error('host cancelled');const pending=openImage(fixture(),{signal:controller.signal,formatWorker:readyWorker(w)});const rejected=expect(pending).rejects.toBe(reason);
 await vi.waitFor(()=>expect(w.postMessage).toHaveBeenCalledOnce());controller.abort(reason);await rejected;expect(w.terminate).toHaveBeenCalledOnce();
});
it('advanced sources reject outstanding reads if their worker dies',async()=> {
 const w=worker();w.postMessage.mockImplementation((...args:unknown[])=>{if('blob' in (args[0] as object))queueMicrotask(()=>w.onmessage!({data:{opened:{width:3,height:2}}}));});
 const source=await openImage(fixture(),{formatWorker:readyWorker(w)});const pending=source.readTile({level:0,x:0,y:0});w.onerror!({message:'died',preventDefault(){}});await expect(pending).rejects.toThrow('died');await expect(source.idle!()).rejects.toThrow('died');expect(w.terminate).toHaveBeenCalledOnce();
});

for(const format of ['tiff','psd','raw','heif'] as const)it(`${format} timeout terminates without retrying on the page thread`,async()=> {
 vi.useFakeTimers();const w=worker();const {openFormat}=await import('./open-format.js');const registry=await import('./registry.js'),decode=vi.spyOn(registry,'decodeFormat');
 const pending=openFormat(fixture(),format,{formatWorker:readyWorker(w)});const rejected=expect(pending).rejects.toThrow('decode timed out');
 await vi.advanceTimersByTimeAsync(30000);await rejected;expect(w.terminate).toHaveBeenCalledOnce();expect(decode).not.toHaveBeenCalled();decode.mockRestore();
});
for(const format of ['tiff','psd','raw','heif'] as const)it(`${format} worker resource failure after startup never retries locally`,async()=> {
 const w=worker();w.postMessage.mockImplementation(()=>queueMicrotask(()=>{w.onmessage!({data:{ready:true}});w.onerror!({message:'Out of memory',preventDefault(){}});}));
 const {openFormat}=await import('./open-format.js');const registry=await import('./registry.js'),decode=vi.spyOn(registry,'decodeFormat');
 try {await expect(openFormat(fixture(),format,{formatWorker:readyWorker(w)})).rejects.toThrow('Out of memory');expect(decode).not.toHaveBeenCalled();expect(w.terminate).toHaveBeenCalledOnce();}finally {decode.mockRestore();}
});
it('explicit HEIF decoder rejection never retries on the page thread',async()=> {
 const w=worker();w.postMessage.mockImplementation(()=>queueMicrotask(()=>w.onmessage!({data:{error:'HEIF exceeds pixel limit'}})));
 const {openFormat}=await import('./open-format.js');await expect(openFormat(fixture(),'heif',{formatWorker:readyWorker(w)})).rejects.toThrow('pixel limit');expect(w.terminate).toHaveBeenCalledOnce();
});
it('worker construction failure can still use the validated local decoder',async()=> {
 const source=await openImage(fixture(),{formatWorker:()=>{throw new Error('CSP worker-src none');}});expect(source.width).toBe(3);
});

it('a worker that never signals ready receives no file and times out without fallback',async()=> {
 vi.useFakeTimers();const w=worker();const {openFormat}=await import('./open-format.js');const registry=await import('./registry.js'),decode=vi.spyOn(registry,'decodeFormat');
 try {const pending=openFormat(fixture(),'tiff',{formatWorker:()=>w as unknown as Worker});const rejected=expect(pending).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(30000);await rejected;expect(w.postMessage).not.toHaveBeenCalled();expect(decode).not.toHaveBeenCalled();expect(w.terminate).toHaveBeenCalledOnce();}finally {decode.mockRestore();}
});

it('resource exhaustion during worker construction or module startup never falls back',async()=> {
 const {openFormat}=await import('./open-format.js');const registry=await import('./registry.js'),decode=vi.spyOn(registry,'decodeFormat');
 try {
  await expect(openFormat(fixture(),'tiff',{formatWorker:()=>{throw new RangeError('Allocation failed');}})).rejects.toThrow('Allocation failed');
  const w=worker(),startup=()=>{queueMicrotask(()=>w.onerror!({message:'Out of memory',preventDefault(){}}));return w as unknown as Worker;};
  await expect(openFormat(fixture(),'tiff',{formatWorker:startup})).rejects.toThrow('Out of memory');expect(decode).not.toHaveBeenCalled();expect(w.postMessage).not.toHaveBeenCalled();expect(w.terminate).toHaveBeenCalledOnce();
 }finally {decode.mockRestore();}
});
