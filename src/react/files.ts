import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useSessionState } from './session-context.js';
import type { EditorSession } from '../session/index.js';
import { attachSessionFiles, autosaveSession, renderBatchImage, type SessionFilesOptions } from '../io/session-files.js';
import { exportFormatSupport, type EncodeOptions } from '../io/encode.js';
import { runBatch, type BatchOptions, type BatchResult, type BatchProgress } from '../io/batch/index.js';
import type { AutosaveStore } from '../io/autosave/index.js';
/** Explicitly install file actions on a supplied or nearest session. Host callbacks remain authoritative. */
export function useImageFiles(editor?:EditorSession,options:SessionFilesOptions={}) {
  const session=useEditor(editor); useSessionState(session);
  const projectSave=options.onProjectSave,clipboard=options.clipboard;
  useEffect(()=>attachSessionFiles(session,{...('onProjectSave' in options?{onProjectSave:projectSave}:{}),...('clipboard' in options?{clipboard}:{})}),[session,projectSave,clipboard]);
  return {session,open:(blob:Blob)=>session.run('file.open',blob),openProject:(blob:Blob)=>session.run('file.project.open',blob),saveProject:()=>session.run('file.project.save'),recover:(project:import('../io/project/index.js').ImageProject)=>session.run('file.recover',project),copy:()=>session.run('file.copy'),paste:(event?:Parameters<typeof import('../io/clipboard/index.js').imagesFromPaste>[0])=>session.run('file.paste',event),drop:(files:readonly Blob[])=>session.run('file.drop',files)};
}
/** Actual native/optional codec availability. Loading the hook does not load a codec. */
export function useExportFormats() {
  const [formats,setFormats]=useState<Record<string,boolean>>({'image/png':true,'image/jpeg':false,'image/webp':false,'image/avif':false});
  useEffect(()=> { let live=true; void exportFormatSupport().then(value=>{if(live)setFormats(value);}); return ()=>{live=false;}; },[]); return formats;
}
/** Debounced preview with real encoded bytes; stale results and object URLs are discarded. */
export function useExportPreview(settings:EncodeOptions,render:((settings:EncodeOptions)=>Promise<Blob>)|undefined) {
  const [preview,setPreview]=useState<{blob?:Blob;url?:string;busy:boolean;error?:unknown}>({busy:false});
  const currentUrl=useRef<string | undefined>(undefined);
  useEffect(()=>()=>{if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);},[]);
  const latest=useRef(render);latest.current=render;
  useEffect(()=> {
    if(!render)return; let live=true;
    setPreview(previous=>({...previous,busy:true,error:undefined}));
    const timer=setTimeout(()=> { void latest.current!(settings).then(blob=> {if(!live)return;const url=URL.createObjectURL(blob);if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);currentUrl.current=url;setPreview({blob,url,busy:false});}).catch(error=>{if(live)setPreview(previous=>({...previous,busy:false,error}));}); },200);
    return ()=> {live=false;clearTimeout(timer);};
  },[settings,render]);
  return preview;
}
/** Session export facade. Preview never dispatches an action; delivery always does. */
export function useImageExport(editor?:EditorSession) {
  const {session}=useImageFiles(editor),state=useSessionState(session);
  const render=useCallback((settings:EncodeOptions)=>session.result().toBlob(settings),[session,state.recipe]);
  return {formats:useExportFormats(),render,export:(settings:EncodeOptions)=>session.run('file.export',settings),canExport:session.exportable,ready:state.status==='ready',size:state.size};
}
/** Source metadata and profile from a session, with no dependency on a panel. */
export function useImageMetadata(editor?:EditorSession) {
  const session=useEditor(editor);useSessionState(session);return {metadata:session.original?.metadata??null,profile:session.original?.icc??null};
}
/** Headless batch state as a React hook; renderOne is injected and cancellation is cooperative. */
export function useBatch<S,O,R=unknown>(options:BatchOptions<S,O,R>,runner?:typeof runBatch<S,O,R>) {
  const [results,setResults]=useState<BatchResult<O>[]>([]),[progress,setProgress]=useState<BatchProgress<O>|null>(null),[running,setRunning]=useState(false);
  const controller=useRef<AbortController|null>(null); const latest=useRef(options);latest.current=options;const latestRunner=useRef(runner);latestRunner.current=runner;
  useEffect(()=>()=>controller.current?.abort(),[]);
  const run=useCallback(async(sources:readonly S[])=> {
    controller.current?.abort();const own=new AbortController();controller.current=own;setRunning(true);setResults([]);setProgress(null);
    try { const out=await (latestRunner.current??runBatch)(sources,{...latest.current,signal:own.signal,onProgress:p=> {if(controller.current===own)setProgress(p);latest.current.onProgress?.(p);}});if(controller.current===own)setResults(out);return out; }
    finally {if(controller.current===own)setRunning(false);}
  },[]);
  return {results,progress,running,run,cancel:()=>controller.current?.abort()};
}
/** Session-bound batch facade, retaining the current recipe and registered rendering parts. */
export function useImageBatch(editor?:EditorSession) {
  const {session}=useImageFiles(editor);const {recipe}=useSessionState(session);
  return {recipe,run:(sources:readonly Blob[],options:BatchOptions<Blob,Blob,import('../session/index.js').EditRecipe>)=>session.run('file.batch',{sources,options}),renderOne:(source:Blob,settings:import("../io/batch/index.js").BatchSettings<import("../session/index.js").EditRecipe>,context:{signal?:AbortSignal},overrides:Omit<import("../session/index.js").EditorSessionOptions,"source"|"recipe">={})=>renderBatchImage(source,settings,context,{...session.renderingParts,...overrides})};
}
/** Explicit opt-in: pass a store to subscribe. Undefined performs no persistence. */
export function useImageAutosave(store:AutosaveStore|undefined,id:string,editor?:EditorSession,onError?:(error:unknown)=>void) {
  const session=useEditor(editor);const error=useRef(onError);error.current=onError;
  const current=useRef<ReturnType<typeof autosaveSession>|undefined>(undefined);
  useEffect(()=> {if(!store)return;const save=autosaveSession(session,store,id,e=>error.current?.(e));current.current=save;return ()=>{save.dispose();current.current=undefined;};},[session,store,id]);
  return useMemo(()=>({flush:()=>current.current?.flush(),list:()=>current.current?.list()}),[]);
}
