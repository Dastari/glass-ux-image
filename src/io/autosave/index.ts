import { ensure, FileDataError } from '../formats/bytes.js';
import { readProject, writeProject, type ImageProject, type ProjectManifest } from '../project/index.js';
/** A recoverable snapshot listing, without loading image data. */
export interface AutosaveSummary {
  /** Host-owned key, restricted to a safe filename alphabet. */
  id:string;
  /** Snapshot time in epoch milliseconds. */
  updatedAt:number;
  /** Encoded project byte count. */
  bytes:number;
}
export interface AutosaveRecord extends AutosaveSummary {
  /** Complete .guxi snapshot; no image data is put in localStorage. */
  data:Blob;
}
/** No adapter is opened or scheduled until a host explicitly constructs and calls it. */
export interface AutosaveStore {
  /** Atomically replace one snapshot; storage/permission failures reject. */
  put(record:AutosaveRecord):Promise<void>;
  /** Read a snapshot, or undefined when absent. */
  get(id:string):Promise<AutosaveRecord|undefined>;
  /** List recoverable candidates without opening a document. */
  list():Promise<AutosaveSummary[]>;
  /** Remove one host-selected snapshot. */
  delete(id:string):Promise<void>;
}
/** Reject unsafe or oversized recovery identifiers before passing them to a storage adapter. */
export function validateAutosaveId(id:string) { ensure(/^[A-Za-z0-9_-]{1,128}$/.test(id),'Invalid autosave id'); }
/** Snapshot references resolved only after an explicit host request. */
export interface SnapshotInput {
  /** Plain recipe, original source reference and all asset references. */
  manifest:ProjectManifest;
  /** Host blob resolver; it owns transport, authentication and cancellation policy. */
  resolve(ref:{path:string;mime:string}):Promise<Uint8Array>;
}
/** Collect the committed recipe, original encoded source and assets for a recoverable snapshot. */
export async function collectSnapshot(input:SnapshotInput):Promise<ImageProject> {
  // Capture plain recipe/reference data before awaiting assets.
  const manifest=structuredClone(input.manifest),blobs=new Map<string,Uint8Array>();
  for(const ref of [manifest.source,...Object.values(manifest.assets)]) if(!blobs.has(ref.path)) blobs.set(ref.path,(await input.resolve(ref)).slice());
  return {manifest,blobs};
}
/** Debounces explicit host requests; serial writes prevent an older save replacing a newer one.
 * Run in a worker for large snapshots, or inject `encode` to hand ZIP work to a worker. */
export function createAutosaveSnapshotter(store:AutosaveStore,id:string,options:{delayMs?:number;onError?:(error:unknown)=>void;now?:()=>number;encode?:(project:ImageProject)=>Promise<Blob>}={}) {
  validateAutosaveId(id); const delay=options.delayMs??500; ensure(Number.isFinite(delay)&&delay>=0&&delay<=60000);
  let timer:ReturnType<typeof setTimeout>|undefined,pending:SnapshotInput|undefined,disposed=false;
  let chain:Promise<void>=Promise.resolve();
  const flush=():Promise<void> => {
    if(timer!==undefined) clearTimeout(timer); timer=undefined;
    if(!pending) return chain; const input=pending; pending=undefined;
    const job=chain.catch(()=>{}).then(async()=> { const project=await collectSnapshot(input); const data=options.encode?await options.encode(project):new Blob([writeProject(project).slice()]); await store.put({id,updatedAt:(options.now??Date.now)(),bytes:data.size,data}); });
    chain=job; return job;
  };
  return {
    schedule(input:SnapshotInput) { ensure(!disposed,'Snapshotter is disposed'); pending={...input,manifest:structuredClone(input.manifest)}; if(timer!==undefined) clearTimeout(timer); timer=setTimeout(()=> { void flush().catch(error=>options.onError?.(error)); },delay); },
    flush,
    /** Cancels pending work; already-started writes complete. */
    dispose() { disposed=true; pending=undefined; if(timer!==undefined) clearTimeout(timer); timer=undefined; },
  };
}
export interface RecoveryCandidate extends AutosaveSummary {
  /** Read and validate bytes; the host separately chooses whether to open this project. */
  recover():Promise<ImageProject>;
}
/** Hosts choose whether and how to offer recovery; listing never opens a session. */
export async function listRecovery(store:AutosaveStore,load?:(blob:Blob)=>Promise<ImageProject>):Promise<RecoveryCandidate[]> {
  return (await store.list()).sort((a,b)=>b.updatedAt-a.updatedAt).map(summary=>({...summary,recover:async()=> { const record=await store.get(summary.id); if(!record) throw new FileDataError('storage','Recovery snapshot no longer exists'); return load?load(record.data):readProject(new Uint8Array(await record.data.arrayBuffer())); }}));
}
