import { ensure, FileDataError, MAX_FILE_BYTES } from '../formats/bytes.js';
import { validateAutosaveId, type AutosaveRecord, type AutosaveStore } from './index.js';
/** Opening is explicit. Inject IDBFactory for a host-managed environment. Call close when finished. */
export async function indexedDbAutosaveStore(name='glass-ux-image-autosave',factory:IDBFactory=globalThis.indexedDB):Promise<AutosaveStore&{close():void}> {
  if(!factory) throw new FileDataError('unsupported','IndexedDB is unavailable');
  const db=await new Promise<IDBDatabase>((resolve,reject)=> { const request=factory.open(name,1); let blocked=false;
    request.onupgradeneeded=()=> { if(!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots',{keyPath:'id'}); };
    request.onerror=()=>reject(new FileDataError('storage','Cannot open autosave database',{cause:request.error}));
    request.onblocked=()=> { blocked=true; reject(new FileDataError('storage','Autosave database is blocked by another connection')); };
    request.onsuccess=()=> { if(blocked) request.result.close(); else resolve(request.result); };
  });
  db.onversionchange=()=>db.close();
  const run=<T>(mode:IDBTransactionMode,request:(store:IDBObjectStore)=>IDBRequest<T>)=>new Promise<T>((resolve,reject)=> {
    try { const tx=db.transaction('snapshots',mode),r=request(tx.objectStore('snapshots')); tx.oncomplete=()=>resolve(r.result); tx.onabort=()=>reject(new FileDataError('storage','Autosave transaction failed',{cause:tx.error})); tx.onerror=()=>{}; }
    catch(cause) { reject(new FileDataError('storage','Cannot access autosave database',{cause})); }
  });
  return {
    async put(r) { validateAutosaveId(r.id); ensure(Number.isFinite(r.updatedAt)&&r.bytes===r.data.size&&r.bytes<=MAX_FILE_BYTES); await run('readwrite',s=>s.put(r)); },
    async get(id) { validateAutosaveId(id); return await run('readonly',s=>s.get(id)) as AutosaveRecord|undefined; },
    async list() { const rows=await run('readonly',s=>s.getAll()) as AutosaveRecord[]; return rows.map(({id,updatedAt,bytes})=>({id,updatedAt,bytes})); },
    async delete(id) { validateAutosaveId(id); await run('readwrite',s=>s.delete(id)); },
    close:()=>db.close(),
  };
}
