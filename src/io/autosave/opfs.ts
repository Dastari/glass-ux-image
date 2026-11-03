import { ensure, FileDataError, MAX_FILE_BYTES } from '../formats/bytes.js';
import { validateAutosaveId, type AutosaveRecord, type AutosaveStore } from './index.js';
/** Small host-supplied boundary; pass an OPFS subdirectory, never a directory containing user files. */
export interface AutosaveDirectory {
  getFileHandle(name:string,options?:{create?:boolean}):Promise<{getFile():Promise<File>;createWritable():Promise<{write(data:Blob):Promise<void>;close():Promise<void>;abort():Promise<void>}>}>;
  removeEntry(name:string):Promise<void>;
  keys():AsyncIterableIterator<string>;
}
const missing=(e:unknown)=>e instanceof Error&&e.name==='NotFoundError';
/** Each snapshot is one atomically replaced file, with a fixed binary envelope and project payload. */
export function opfsAutosaveStore(directory:AutosaveDirectory):AutosaveStore {
  const name=(id:string)=> { validateAutosaveId(id); return `${id}.guxi-autosave`; };
  const get=async(id:string):Promise<AutosaveRecord|undefined>=> {
    try { const file=await (await directory.getFileHandle(name(id))).getFile(); ensure(file.size>=16&&file.size<=MAX_FILE_BYTES+16);
      const b=new Uint8Array(await file.slice(0,16).arrayBuffer()),v=new DataView(b.buffer); ensure(v.getUint32(0)===0x47555841&&v.getUint32(4)===1,'Invalid autosave envelope');
      const updatedAt=v.getFloat64(8); ensure(Number.isFinite(updatedAt)); const data=file.slice(16); return {id,updatedAt,bytes:data.size,data};
    } catch(cause) { if(missing(cause)) return undefined; if(cause instanceof FileDataError) throw cause; throw new FileDataError('storage','Cannot read OPFS autosave',{cause}); }
  };
  return {
    get,
    async put(record) { validateAutosaveId(record.id); ensure(record.data.size<=MAX_FILE_BYTES&&record.bytes===record.data.size&&Number.isFinite(record.updatedAt));
      try { const handle=await directory.getFileHandle(name(record.id),{create:true}),writer=await handle.createWritable();
        try { const h=new Uint8Array(16),v=new DataView(h.buffer); v.setUint32(0,0x47555841); v.setUint32(4,1); v.setFloat64(8,record.updatedAt); await writer.write(new Blob([h,record.data])); await writer.close(); }
        catch(cause) { await writer.abort().catch(()=>{}); throw cause; }
      } catch(cause) { throw new FileDataError('storage','Cannot write OPFS autosave',{cause}); }
    },
    async list() { const records=[]; for await(const key of directory.keys()) if(/^[A-Za-z0-9_-]{1,128}\.guxi-autosave$/.test(key)) { try { const r=await get(key.slice(0,-14)); if(r) records.push({id:r.id,updatedAt:r.updatedAt,bytes:r.bytes}); } catch { /* Incomplete/corrupt candidates are not recoverable. */ } } return records; },
    async delete(id) { try { await directory.removeEntry(name(id)); } catch(cause) { if(!missing(cause)) throw new FileDataError('storage','Cannot delete OPFS autosave',{cause}); } },
  };
}
