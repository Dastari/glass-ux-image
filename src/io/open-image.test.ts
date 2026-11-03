import { afterEach, expect, it, vi } from 'vitest';
import { openImage } from './open-image.js';
import { chunk, PNG_SIGNATURE } from './formats/container.js';
import { concat } from './formats/bytes.js';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('terminates a stalled decode worker and uses the validated native fallback',async()=> {
 vi.useFakeTimers();const header=new Uint8Array(13);header[3]=header[7]=2;header[8]=8;header[9]=6;
 const blob=new Blob([concat([PNG_SIGNATURE,chunk('IHDR',header,'png'),chunk('IEND',new Uint8Array(),'png')])]);
 const worker={terminate:vi.fn(),postMessage:vi.fn(),onmessage:undefined,onerror:undefined};
 vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:2,height:2,close:()=>{}})));
 vi.stubGlobal('OffscreenCanvas',class {getContext(){return {drawImage(){},getImageData(){return {data:new Uint8ClampedArray(16)};}};}});
 const pending=openImage(blob,{worker:()=>worker as unknown as Worker});
 await vi.waitFor(()=>expect(worker.postMessage).toHaveBeenCalled());await vi.advanceTimersByTimeAsync(10_001);
 const source=await pending;expect(worker.terminate).toHaveBeenCalledOnce();expect(source.width).toBe(2);expect(source.originalBlob).toBe(blob);
});

function tinyPng() {const header=new Uint8Array(13);header[3]=header[7]=2;header[8]=8;header[9]=6;return new Blob([concat([PNG_SIGNATURE,chunk('IHDR',header,'png'),chunk('IEND',new Uint8Array(),'png')])]);}
function nativeFallback() {vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:2,height:2,close:()=>{}})));vi.stubGlobal('OffscreenCanvas',class {getContext(){return {drawImage(){},getImageData(){return {data:new Uint8ClampedArray(16)};}};}});}
function fakeWorker() {return {terminate:vi.fn(),postMessage:vi.fn(),onmessage:undefined as undefined|((e:{data:unknown})=>void),onerror:undefined as undefined|((e:{message:string;preventDefault:()=>void})=>void),onmessageerror:undefined as undefined|(()=>void)};}
for(const kind of ['error','messageerror','postMessage'] as const)it(`falls back to openHere on worker ${kind}`,async()=> {
 nativeFallback();const worker=fakeWorker();worker.postMessage.mockImplementation(()=>{if(kind==='error')queueMicrotask(()=>worker.onerror!({message:'worker died',preventDefault(){}}));else if(kind==='messageerror')queueMicrotask(()=>worker.onmessageerror!());else throw new Error('Cannot clone');});
 const source=await openImage(tinyPng(),{worker:()=>worker as unknown as Worker});expect(source.width).toBe(2);expect(worker.terminate).toHaveBeenCalledOnce();expect(createImageBitmap).toHaveBeenCalledOnce();
});
for(const kind of ['error','messageerror','silent','transfer','tile-reply'] as const)it(`rejects outstanding and future reads after a ${kind} tile failure`,async()=> {
 vi.useFakeTimers();const worker=fakeWorker();worker.postMessage.mockImplementation((...args:unknown[])=>{const request=args[0] as {type:string};if(request.type==='open')queueMicrotask(()=>worker.onmessage!({data:{type:'opened',width:2,height:2}}));});
 const source=await openImage(tinyPng(),{worker:()=>worker as unknown as Worker}),tile={level:0,x:0,y:0};
 if(kind==='transfer')worker.postMessage.mockImplementation(()=>{throw new DOMException('Detached','DataCloneError');});
 const pending=source.readTile(tile) as Promise<unknown>,rejected=expect(pending).rejects.toBeInstanceOf(Error);
 if(kind==='error')worker.onerror!({message:'dead',preventDefault(){}});
 if(kind==='messageerror')worker.onmessageerror!();
 if(kind==='tile-reply')worker.onmessage!({data:{type:'failed',id:0,message:'Tile transfer failed'}});
 if(kind==='silent')await vi.advanceTimersByTimeAsync(10_001);
 await rejected;await expect(source.readTile(tile)).rejects.toBeInstanceOf(Error);await expect(source.idle!()).rejects.toBeInstanceOf(Error);expect(worker.terminate).toHaveBeenCalledOnce();
});
it('supports explicit decoder disposal, rejecting pending and future tile reads',async()=>{
  const worker=fakeWorker();worker.postMessage.mockImplementation((...args:unknown[])=>{if((args[0] as {type:string}).type==='open')queueMicrotask(()=>worker.onmessage!({data:{type:'opened',width:2,height:2}}));});
  const source=await openImage(tinyPng(),{worker:()=>worker as unknown as Worker});
  const pending=source.readTile({level:0,x:0,y:0});source.dispose!();source.dispose!();
  await expect(pending).rejects.toThrow('Image disposed');await expect(source.idle!()).rejects.toThrow('Image disposed');expect(worker.terminate).toHaveBeenCalledOnce();
});
