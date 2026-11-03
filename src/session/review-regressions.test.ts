import { expect, it, vi } from 'vitest';
import { createEditorSession } from './session.js';
import { normaliseRecipe } from './recipe.js';
import { solidSource, type TileSource } from '../core/index.js';
import { createRetouchStage } from '../retouch/store.js';
const ready = async (s: ReturnType<typeof createEditorSession>) => { await vi.waitFor(() => expect(s.state.status).toBe('ready')); };
const stroke = { id:'one', tool:'brush', params:{size:8,hardness:1,colour:[1,0,0,1]}, points:[{x:8,y:8}] };
it('keeps edits made during save dirty and never labels them Saved', async () => {
  let finish!: () => void;
  const saved: unknown[] = [];
  const s = createEditorSession({source:solidSource({width:16,height:16},[0,0,0,1]),onSave:r=>{saved.push(r.recipe);return new Promise<void>(r=>{finish=r;});}});
  try { await ready(s); s.flip('x'); const submitted=s.state.recipe, work=s.save(); s.flip('y'); finish(); await work;
    expect(saved).toEqual([submitted]); expect(s.state.dirty).toBe(true); expect(s.state.save).toBe('idle');
    s.undo(); expect(s.state.dirty).toBe(false);
  } finally { s.dispose(); }
});
it('isolates historical and concurrent retouch previews from live pixels', async () => {
  const s=createEditorSession({source:solidSource({width:16,height:16},[0,0,0,1]),stages:[createRetouchStage()]});
  try { await ready(s);const old=s.state.recipe;s.setStrokes([stroke]);const index=(8*16+8)*4;
    expect((await s.readPreview(16)).data[index]).toBe(1);
    const [before,after]=await Promise.all([s.readPreview(16,{recipe:old}),s.readPreview(16)]);
    expect(before.data[index]).toBe(0);expect(after.data[index]).toBe(1);
    expect((await s.readPreview(16)).data[index]).toBe(1);
  } finally {s.dispose();}
});
it('releases obsolete layer-source subscriptions when replacing documents',async()=>{
  const sources: Array<{active:()=>number}> = [];
  const s=createEditorSession({source:solidSource({width:16,height:16},[0,0,0,1]),layerKinds:[{kind:'custom',source(){let active=0;const p=solidSource({width:16,height:16},[1,0,0,1]);const wrapped={...p,active:()=>active,invalidated(){active++;return()=>{active--;};}};sources.push(wrapped);return wrapped;}}]});
  try {await ready(s);
    for(let i=0;i<12;i++){s.setLayers([{id:'l',name:'L',kind:'custom',visible:true,opacity:1,blend:'normal',quad:[[0,0],[16,0],[16,16],[0,16]],data:{i}}]);await s.readPreview(16);}
    expect(sources.slice(0,-2).every(p=>p.active()===0)).toBe(true);
    expect(sources.reduce((sum,p)=>sum+p.active(),0)).toBeLessThanOrEqual(2);
  }finally{s.dispose();}expect(sources.every(p=>p.active()===0)).toBe(true);
});
it('rejects hostile geometry before allocating export pixels',async()=>{
  const s=createEditorSession({source:solidSource({width:1,height:1},[0,0,0,1])});
  try {await ready(s);expect(()=>s.setGeometry({resize:{width:100000,height:100000}})).toThrow();}finally{s.dispose();}
});
it.each([NaN,Infinity,-1,0,100000])('rejects invalid recipe dimensions %s',width=>{
  expect(()=>normaliseRecipe({geometry:{rotation:0,flipX:false,flipY:false,crop:null,resize:{width,height:100000}}})).toThrow();
});
it('propagates preview tile failures without requiring a source idle reporter',async()=>{
  let reads=0;const original=new Error('tile failed'),guard=new Error('retry guard');
  const source:TileSource={width:16,height:16,async readTile(){reads++;throw original;},async idle(){if(reads>=5)throw guard;}};
  const s=createEditorSession({source});try{await ready(s);await expect(s.readPreview(16)).rejects.toBe(original);expect(reads).toBe(1);}finally{s.dispose();}
});
it('aborts a thumbnail preview blocked on an uncooperative source',async()=>{
  const s=createEditorSession({source:{width:16,height:16,readTile:()=>new Promise<never>(()=>{})}});
  try{await ready(s);const controller=new AbortController(),error=new Error('cancel thumbnail');const work=s.readPreview(16,{signal:controller.signal});setTimeout(()=>controller.abort(error),5);await expect(work).rejects.toBe(error);}finally{s.dispose();}
});
it('does not mark a cancelled save as saved when a host ignores cancellation',async()=>{
  let finish!:()=>void;
  const s=createEditorSession({source:solidSource({width:16,height:16},[0,0,0,1]),onSave:()=>new Promise<void>(r=>{finish=r;})});
  try{await ready(s);s.flip('x');const work=s.save();s.cancelSave();finish();await work;expect(s.state.dirty).toBe(true);expect(s.state.save).toBe('idle');}finally{s.dispose();}
});
it('isolates sessions reusing a retouch stage and decoded base',async()=>{
  const stage=createRetouchStage(),source=solidSource({width:16,height:16},[0,0,0,1]);
  const a=createEditorSession({source,stages:[stage]}),b=createEditorSession({source,stages:[stage]});
  try{await ready(a);await ready(b);a.setStrokes([stroke]);await a.document!.layers[0]!.source.idle?.();
    const tile={level:0,x:0,y:0};expect((await b.document!.layers[0]!.source.readTile(tile)).data[(8*16+8)*4]).toBe(0);
  }finally{a.dispose();b.dispose();}
});
