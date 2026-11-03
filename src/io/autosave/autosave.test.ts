import { afterEach, expect, it, vi } from 'vitest';
import { collectSnapshot, createAutosaveSnapshotter, listRecovery, type AutosaveRecord, type AutosaveStore, type SnapshotInput } from './index.js';
import { opfsAutosaveStore, type AutosaveDirectory } from './opfs.js';
import { indexedDbAutosaveStore } from './indexeddb.js';
function memory() { const rows=new Map<string,AutosaveRecord>(); const store:AutosaveStore={put:async r=>{rows.set(r.id,r);},get:async id=>rows.get(id),list:async()=>[...rows.values()].map(({id,updatedAt,bytes})=>({id,updatedAt,bytes})),delete:async id=>{rows.delete(id);}}; return {store,rows}; }
const input=():SnapshotInput=>({manifest:{version:1,recipe:{layers:[{asset:'a'}]},source:{path:'blobs/s',mime:'image/png'},assets:{a:{path:'blobs/a',mime:'image/png'}}},resolve:async ref=>new TextEncoder().encode(ref.path)});
afterEach(()=>vi.useRealTimers());
it('does nothing until the host schedules, debounces and exposes recovery',async()=> { vi.useFakeTimers(); const {store,rows}=memory(),save=createAutosaveSnapshotter(store,'doc',{delayMs:100,now:()=>123}); expect(rows.size).toBe(0); save.schedule(input()); save.schedule(input()); await vi.advanceTimersByTimeAsync(99); expect(rows.size).toBe(0); await vi.advanceTimersByTimeAsync(1); await save.flush(); expect(rows.size).toBe(1); const list=await listRecovery(store); expect(list[0]?.updatedAt).toBe(123); expect((await list[0]!.recover()).blobs.size).toBe(2); save.dispose(); });
it('captures recipe data before asynchronous resolution and deduplicates references',async()=> { const i=input(); i.manifest.assets.a=i.manifest.source; const resolve=vi.fn(i.resolve); i.resolve=resolve; const pending=collectSnapshot(i); i.manifest.recipe={changed:true}; const p=await pending; expect(p.manifest.recipe).toEqual({layers:[{asset:'a'}]}); expect(resolve).toHaveBeenCalledOnce(); });
it('cancels pending snapshots on dispose and surfaces explicit flush errors',async()=> { vi.useFakeTimers(); const {store}=memory(),put=vi.fn(store.put); store.put=put; const save=createAutosaveSnapshotter(store,'doc'); save.schedule(input()); save.dispose(); await vi.runAllTimersAsync(); expect(put).not.toHaveBeenCalled(); const failed=createAutosaveSnapshotter({...store,put:async()=>{throw new Error('quota');}},'doc'); failed.schedule(input()); await expect(failed.flush()).rejects.toThrow('quota'); failed.dispose(); });
it('serialises saves so old work never replaces new snapshots',async()=> { const {store,rows}=memory(); let release!:()=>void; const wait=new Promise<void>(r=>{release=r;}); const i=input(); i.resolve=async()=> {await wait; return new Uint8Array([1]);}; const save=createAutosaveSnapshotter(store,'doc'); save.schedule(i); const first=save.flush(); const secondInput=input(); secondInput.manifest.recipe={newer:true}; save.schedule(secondInput); const second=save.flush(); release(); await Promise.all([first,second]); const recovered=await (await listRecovery(store))[0]!.recover(); expect(recovered.manifest.recipe).toEqual({newer:true}); expect(rows.size).toBe(1); save.dispose(); });
it('OPFS envelopes round trip, list and delete; ignores corrupt candidates',async()=> {
  const files=new Map<string,Blob>(); const dir:AutosaveDirectory={
    async getFileHandle(name,options) { if(!files.has(name)&&!options?.create) throw new DOMException('missing','NotFoundError'); return {getFile:async()=>files.get(name)! as File,createWritable:async()=> { let next:Blob; return {write:async data=>{next=data;},close:async()=>{files.set(name,next);},abort:async()=>{}}; }}; },
    async removeEntry(name) { files.delete(name); }, async *keys() { yield* files.keys(); },
  };
  const store=opfsAutosaveStore(dir),data=new Blob(['bytes']); await store.put({id:'doc',updatedAt:99,bytes:data.size,data}); expect(await (await store.get('doc'))?.data.text()).toBe('bytes'); expect(await store.list()).toEqual([{id:'doc',updatedAt:99,bytes:5}]); files.set('bad.guxi-autosave',new Blob(['corrupt'])); expect(await store.list()).toHaveLength(1); await store.delete('doc'); expect(await store.get('doc')).toBeUndefined(); await expect(store.get('../escape')).rejects.toThrow();
});
it('IndexedDB fails plainly when no factory exists, without using localStorage',async()=> { await expect(indexedDbAutosaveStore('test',undefined)).rejects.toMatchObject({code:'unsupported'}); });
it('IndexedDB waits for transaction completion and supports put/get/list/delete',async()=> {
  const rows=new Map<string,AutosaveRecord>(); const close=vi.fn(); const order:string[]=[];
  const db={objectStoreNames:{contains:()=>true},close,onversionchange:undefined,transaction:()=> {
    const tx={oncomplete:undefined as undefined|(()=>void),onabort:undefined,onerror:undefined,objectStore:()=> {
      const request=<T>(result:T)=> { queueMicrotask(()=> { order.push('complete'); tx.oncomplete?.(); }); return {result}; };
      return {put:(r:AutosaveRecord)=> { rows.set(r.id,r); return request(r.id); },get:(id:string)=>request(rows.get(id)),getAll:()=>request([...rows.values()]),delete:(id:string)=> {rows.delete(id);return request(undefined);}};
    }}; return tx;
  }};
  const factory={open:()=> { const request={result:db,onsuccess:undefined as undefined|(()=>void)}; queueMicrotask(()=>request.onsuccess?.()); return request; }};
  const store=await indexedDbAutosaveStore('test',factory as unknown as IDBFactory),data=new Blob(['a']);
  await store.put({id:'doc',updatedAt:1,bytes:1,data}); expect(order).toEqual(['complete']); expect((await store.get('doc'))?.data).toBe(data); expect(await store.list()).toEqual([{id:'doc',updatedAt:1,bytes:1}]); await store.delete('doc'); expect(await store.get('doc')).toBeUndefined(); store.close(); expect(close).toHaveBeenCalledOnce();
});
