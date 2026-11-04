import { encodeProject, decodeProject } from './project/async.js';
import type { FileProvider, FileStat } from 'glass-ux/file-provider';
import type { EditorSession, ActionOverride, EditRecipe } from '../session/index.js';
import { type EncodeOptions } from './encode.js';
import { type ImageProject, type ProjectManifest } from './project/index.js';
import { ensure, MAX_FILE_BYTES } from './formats/bytes.js';
import { browserImageClipboard, imagesFromPaste, readClipboardImages, writeClipboardPng, type ImageClipboard } from './clipboard/index.js';
import { collectSnapshot, createAutosaveSnapshotter, listRecovery, type AutosaveStore } from './autosave/index.js';
import { runBatch, type BatchOptions } from './batch/index.js';
/** Explicit host destinations and optional clipboard boundary. None are enabled implicitly. */
export interface SessionFilesOptions {
  /** Receives a project blob. The host decides how and whether to store it. */
  onProjectSave?:(blob:Blob)=>unknown;
  /** Opt-in clipboard, usually constructed in the browser by the host. */
  clipboard?:ImageClipboard;
}
/** Build a manifest retaining original bytes and original content-addressed asset ids. */
export async function snapshotSession(session:EditorSession):Promise<ImageProject> {
  const source=session.original?.originalBlob; ensure(source,'A project needs the original source blob');
  const manifest:ProjectManifest={version:1,recipe:JSON.parse(JSON.stringify(session.state.recipe)),source:{path:'blobs/source',mime:source.type},assets:{}};
  const blobs=new Map<string,Blob>([['blobs/source',source]]);
  for(const asset of session.assets.entries) { ensure(asset.blob,`Asset ${asset.id} has no original blob`); const path=`blobs/asset-${encodeURIComponent(asset.id)}`; manifest.assets[asset.id]={path,mime:asset.blob.type}; blobs.set(path,asset.blob); }
  return collectSnapshot({manifest,resolve:async ref=>new Uint8Array(await blobs.get(ref.path)!.arrayBuffer())});
}
/** Restore source and assets through the current action. Tool layer kinds must already be registered. */
async function restore(session:EditorSession,project:ImageProject) {
  const assets=await Promise.all(Object.entries(project.manifest.assets).map(async([id,ref])=> { const blob=new Blob([project.blobs.get(ref.path)!.slice()],{type:ref.mime}); return {id,blob,source:await session.decodeImage(blob)}; }));
  const ref=project.manifest.source,source=new Blob([project.blobs.get(ref.path)!.slice()],{type:ref.mime});
  await session.openSource(source,project.manifest.recipe as unknown as EditRecipe,assets);
}
/** Domain actions are opt-in and all pass through the session's onAction interception. */
export function fileActions(options:SessionFilesOptions={}):readonly ActionOverride[] {
  const clipboard=()=>options.clipboard??browserImageClipboard();
  return [
    {id:'file.open',run:(s,input)=>s.openSource(input as Blob)},
    {id:'file.export',enabled:s=>s.exportable&&s.state.status==='ready',run:async(s,args)=> { const controller=new AbortController(); const blob=await s.result().toBlob(args as EncodeOptions); await s.deliverExport(blob,{signal:controller.signal,setProgress:()=>{}}); return blob; }},
    {id:'file.project.save',enabled:()=>!!options.onProjectSave,run:async s=> {const blob=await encodeProject(await snapshotSession(s)); await options.onProjectSave?.(blob); return blob;}},
    {id:'file.project.open',run:async(s,input)=> {const blob=input as Blob;ensure(blob.size<=MAX_FILE_BYTES,'Project exceeds byte limit');return restore(s,await decodeProject(blob));}},
    {id:'file.recover',run:async(s,project)=>restore(s,project as ImageProject)},
    {id:'file.paste',run:async(s,event)=> { const images=event?imagesFromPaste(event as Parameters<typeof imagesFromPaste>[0]):await readClipboardImages(clipboard()); if(images[0])await s.openSource(images[0]); }},
    {id:'file.copy',enabled:s=>s.state.status==='ready',run:async s=>writeClipboardPng(await s.result().toBlob({type:'image/png',metadata:'strip'}),clipboard())},
    {id:'file.drop',run:async(s,files)=> { const first=(files as readonly Blob[])[0]; if(first)await s.openSource(first); }},
    {id:'file.batch',run:(_s,args)=> { const {sources,options:batch}=args as {sources:readonly Blob[];options:BatchOptions<Blob,Blob,EditRecipe>}; return runBatch(sources,batch); }},
  ];
}
/** Install opt-in file actions, respecting actions the host has already supplied. */
const installations=new WeakMap<EditorSession,{options:SessionFilesOptions;users:Map<object,SessionFilesOptions>;remove:()=>void}>();
/** Register intercepted file and project actions using host adapters. Returns a function to detach them. */
export function attachSessionFiles(session:EditorSession,options:SessionFilesOptions={}) {
  let entry=installations.get(session);
  if(!entry) {const current:SessionFilesOptions={};entry={options:current,users:new Map(),remove:session.registerActions(fileActions(current))};installations.set(session,entry);}
  const own={},installed=entry;installed.users.set(own,options);
  const refresh=()=>{delete installed.options.onProjectSave;delete installed.options.clipboard;for(const value of installed.users.values())Object.assign(installed.options,value);};refresh();
  return ()=> {installed.users.delete(own);refresh();if(!installed.users.size){installed.remove();installations.delete(session);}};
}
/** Bytes asked of a provider at once; a larger file arrives in several version-pinned ranges. */
const PROVIDER_CHUNK=4*1024*1024;
/**
 * Read a picture through Glass UX's shared provider contract. The listing a dialog returns may lack
 * a size or a version, so those come from `stat`; every range then names that version, so a file
 * changed during the read fails with `changed` rather than mixing two versions. A size the provider
 * does not know is found by reading until a range comes back short, as the contract allows only at
 * the end of the file.
 */
export async function readProviderImage(provider:FileProvider,file:Pick<FileStat,'uri'|'size'|'mime'>&{version?:FileStat['version']},signal:AbortSignal):Promise<Blob> {
  const stat=file.version!==undefined&&file.size!==null?file:await provider.stat(file.uri,{signal});
  const size=stat.size;
  ensure(size===null||(size>=0&&size<=MAX_FILE_BYTES),'Provider file is too large');
  const parts:Uint8Array[]=[];let offset=0;
  while(size===null||offset<size) {
    const length=size===null?PROVIDER_CHUNK:Math.min(PROVIDER_CHUNK,size-offset);
    const bytes=await provider.read(stat.uri,{offset,length},{signal,version:stat.version});
    ensure(bytes.length<=length,'Provider returned more than the range');
    parts.push(bytes);offset+=bytes.length;
    ensure(offset<=MAX_FILE_BYTES,'Provider file is too large');
    if(bytes.length<length) {ensure(size===null,'Incomplete provider read');break;}
  }
  return new Blob(parts as BlobPart[],{type:stat.mime??file.mime??''});
}
/** Opt-in autosave subscription. No storage is opened here; the host supplies its adapter. */
export function autosaveSession(session:EditorSession,store:AutosaveStore,id:string,onError?:(error:unknown)=>void) {
  const snapshotter=createAutosaveSnapshotter(store,id,{onError,encode:encodeProject}); let previous=session.state.recipe,generation=0;
  const unsubscribe=session.subscribe(()=> {if(session.state.status!=='ready'||previous===session.state.recipe)return;previous=session.state.recipe;
    const requested=++generation;void snapshotSession(session).then(p=>{if(requested===generation)snapshotter.schedule({manifest:p.manifest,resolve:async ref=>p.blobs.get(ref.path)!});}).catch(onError??(()=>{}));
  });
  return {async flush() {++generation;const p=await snapshotSession(session);snapshotter.schedule({manifest:p.manifest,resolve:async ref=>p.blobs.get(ref.path)!});await snapshotter.flush();},list:()=>listRecovery(store,decodeProject),dispose(){++generation;unsubscribe();snapshotter.dispose();}};
}
/** Independent batch rendering; each source owns a short-lived session with host-supplied tools. */
export async function renderBatchImage(source:Blob,settings:import('./batch/index.js').BatchSettings<EditRecipe>,context:{signal?:AbortSignal},sessionOptions:Omit<import('../session/index.js').EditorSessionOptions,'source'|'recipe'>={}) {
  const {createEditorSession}=await import('../session/index.js'); const session=createEditorSession({...sessionOptions,source,recipe:settings.recipe});
  try { while(session.state.status==='loading') { context.signal?.throwIfAborted();await new Promise(r=>setTimeout(r,0)); } if(session.state.status==='failed')throw session.state.error;
    return await session.result().toBlob({type:settings.format,quality:settings.quality,alpha:settings.alpha,metadata:settings.metadata,width:settings.width,height:settings.height,signal:context.signal});
  } finally {session.dispose();}
}

