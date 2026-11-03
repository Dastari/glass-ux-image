import { expect, it, vi } from 'vitest';
import { createEditorSession } from '../../session/session.js';
import { solidSource } from '../../core/index.js';
import { addImageLayer } from './operations.js';
it('terminates image-layer decoders on session disposal',async()=>{
  const workers:FakeWorker[]=[];
  class FakeWorker {onmessage?: (e:unknown)=>void;terminate=vi.fn();constructor(){workers.push(this);}postMessage(m:{type:string}){if(m.type==='open')queueMicrotask(()=>this.onmessage?.({data:{type:'opened',width:2,height:2}}));}}
  vi.stubGlobal('Worker',FakeWorker);
  const s=createEditorSession({source:solidSource({width:16,height:16},[0,0,0,1])});
  try{await vi.waitFor(()=>expect(s.state.status).toBe('ready'));await addImageLayer(s,new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]),'L','Add');s.dispose();expect(workers).toHaveLength(1);expect(workers[0]!.terminate).toHaveBeenCalledOnce();}finally{s.dispose();vi.unstubAllGlobals();}
});
it('terminates project-asset and replacement-base decoders on session disposal',async()=>{
  const {fileActions}=await import('../../io/session-files.js');
  const workers:FakeWorker[]=[];
  class FakeWorker {onmessage?: (e:unknown)=>void;terminate=vi.fn();constructor(){workers.push(this);}postMessage(m:{type:string}){if(m.type==='open')queueMicrotask(()=>this.onmessage?.({data:{type:'opened',width:2,height:2}}));}}
  vi.stubGlobal('Worker',FakeWorker);
  const s=createEditorSession({source:solidSource({width:16,height:16},[0,0,0,1])});
  try{await vi.waitFor(()=>expect(s.state.status).toBe('ready'));
    const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
    await fileActions().find(a=>a.id==='file.recover')!.run!(s,{manifest:{version:1,recipe:{},assets:{layer:{path:'blobs/layer',mime:'image/png'}},source:{path:'blobs/source',mime:'image/png'}},blobs:new Map([['blobs/layer',bytes],['blobs/source',bytes]])});
    s.dispose();expect(workers).toHaveLength(2);for(const worker of workers)expect(worker.terminate).toHaveBeenCalledOnce();
  }finally{s.dispose();vi.unstubAllGlobals();}
});
