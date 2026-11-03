import { expect, it } from 'vitest';
import { solidSource, createImageDocument } from '../core/index.js';
import { CpuBackend, composeDocument, Renderer } from './index.js';
class Headless extends CpuBackend { override get canvas(){return {width:16,height:16} as HTMLCanvasElement;} override resize(){} override present(){} }
it('rejects export on the first failed tile',async()=>{
  let reads=0;const error=new Error('unavailable');
  const source={width:16,height:16,async readTile(){reads++;throw error;},async idle(){if(reads>=5)throw new Error('guard');}};
  const d=createImageDocument(source);d.addLayer({source});try{await expect(composeDocument(new CpuBackend(),d)).rejects.toBe(error);expect(reads).toBe(1);}finally{d.dispose();}
});
it.each([false,true])('settles promptly when disposed during/before a call (%s)',async before=>{
  const source=solidSource({width:16,height:16},[0,0,0,1]),d=createImageDocument(source);d.addLayer({source});
  const r=new Renderer({document:d,backend:new Headless()});if(before)r.dispose();
  const work=r.settle();if(!before)r.dispose();
  const status=await Promise.race([work.then(()=> 'resolved',()=> 'rejected'),new Promise(resolve=>setTimeout(()=>resolve('pending'),30))]);
  expect(status).not.toBe('pending');d.dispose();
});
it('notifies the renderer once for a failed source with no idle hook',async()=>{
  const error=new Error('offline');let reads=0;const errors:unknown[]=[];
  const source={width:16,height:16,readTile(){reads++;throw error;}};
  const d=createImageDocument(source);d.addLayer({source});const r=new Renderer({document:d,backend:new Headless(),onError:e=>errors.push(e)});
  try{await expect(r.settle()).rejects.toBe(error);r.frame();await new Promise(resolve=>setTimeout(resolve,0));expect(reads).toBe(1);expect(errors).toEqual([error]);}finally{r.dispose();d.dispose();}
});
it('aborts export even when a tile source never resolves',async()=>{
  const source={width:16,height:16,readTile:()=>new Promise<never>(()=>{})};
  const d=createImageDocument(source);d.addLayer({source});const controller=new AbortController(),reason=new Error('cancel export');
  try{const work=composeDocument(new CpuBackend(),d,{signal:controller.signal});setTimeout(()=>controller.abort(reason),5);await expect(work).rejects.toBe(reason);}finally{d.dispose();}
});
it('settle rejects disposal while blocked on source idle',async()=>{
  const source={...solidSource({width:16,height:16},[0,0,0,1]),idle:()=>new Promise<void>(()=>{})};
  const d=createImageDocument(source);d.addLayer({source});const r=new Renderer({document:d,backend:new Headless()});
  const work=r.settle();r.dispose();await expect(work).rejects.toThrow('Renderer disposed');d.dispose();
});
import { GeometryError } from '../core/geometry-validation.js';
it('rejects oversized export dimensions before constructing the output byte array',async()=>{
  const source=solidSource({width:100000,height:100000},[0,0,0,1]),d=createImageDocument(source);d.addLayer({source});
  try{await expect(composeDocument(new CpuBackend(),d)).rejects.toBeInstanceOf(GeometryError);}finally{d.dispose();}
});
