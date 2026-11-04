import { Notice } from 'glass-ux/notice';
import { useCallback, useState } from 'react';
import { Button } from 'glass-ux/button';
import { FileDrop, FileList, FileRow } from 'glass-ux/file-drop';
import { Progress } from 'glass-ux/progress';
import { useMessages } from 'glass-ux/i18n';
import { filesMessages, type FilesMessages } from '../messages/files.js';
import { useBatch, useImageBatch } from '../react/files.js';
import type { BatchResult, BatchSettings } from '../io/batch/index.js';
import { IMAGE_IMPORT_ACCEPT } from '../io/formats/index.js';
import type { EditorSession, EditRecipe } from '../session/index.js';
import { ExportPanel } from './export.js';
import { PanelActions } from '../react/panel-layout.js';
import type { EncodeOptions } from '../io/encode.js';
/** Standalone batch picker and runner over an injected renderer. */
export interface BatchPanelProps {
  /** Controlled input list. */
  sources?:readonly File[];
  /** Initial list in uncontrolled use. */
  defaultSources?:readonly File[];
  /** Reports the next input list. */
  onSourcesChange?:(sources:readonly File[])=>void;
  /** Plain output/recipe settings. */
  settings?:BatchSettings<EditRecipe>;
  /** Report edited format, quality and dimensions. */
  onSettingsChange?:(settings:BatchSettings<EditRecipe>)=>void;
  /** Render one image without relying on any editor context. */
  renderOne:(source:Blob,settings:BatchSettings<EditRecipe>,context:{signal?:AbortSignal;index:number})=>Promise<Blob>;
  /** Receives every result. The host chooses whether to save successful files. */
  onComplete?:(results:BatchResult<Blob>[])=>unknown;
  /** Optional intercepted run supplied by a session binding. */
  runBatch?:(sources:readonly Blob[],options:import('../io/batch/index.js').BatchOptions<Blob,Blob,EditRecipe>)=>Promise<BatchResult<Blob>[]>;
  /** Maximum concurrent files; default two. */
  concurrency?:number;
  /** Host word overrides. */
  labels?:Partial<FilesMessages>;
}
/** Choose local files and run an injected renderer with per-file results. The host owns delivery. */
export function BatchPanel({sources:controlled,defaultSources=[],onSourcesChange,settings:provided,onSettingsChange,renderOne,onComplete,runBatch,concurrency=2,labels}:BatchPanelProps) {
  const m=useMessages(filesMessages,{labels}),[local,setLocal]=useState(defaultSources),sources=controlled??local;
  const [localSettings,setLocalSettings]=useState<BatchSettings<EditRecipe>>({format:'image/png',quality:.82});const settings=provided??localSettings;
  const batch=useBatch({settings,renderOne,concurrency},runBatch),[error,setError]=useState(false);
  const updateSources=(next:readonly File[])=>{if(controlled===undefined)setLocal(next);onSourcesChange?.(next);};
  const value:EncodeOptions={type:settings.format??'image/png',quality:settings.quality,alpha:settings.alpha,metadata:settings.metadata,width:settings.width,height:settings.height};
  const run=async()=> {setError(false);try {const results=await batch.run(sources);await onComplete?.(results);}catch{setError(true);}};
  return <div className="gi-panel gi-files"><FileDrop aria-label={m.sources} accept={IMAGE_IMPORT_ACCEPT} multiple disabled={batch.running} onFiles={files=>updateSources([...sources,...files])}/>
    <ExportPanel value={value} onValueChange={v=>{const next={...settings,format:v.type,quality:v.quality,alpha:v.alpha,metadata:v.metadata,width:v.width,height:v.height};if(provided===undefined)setLocalSettings(next);onSettingsChange?.(next);}} labels={labels}/>
    <PanelActions><Button size="sm" variant="primary" disabled={!sources.length||batch.running} onClick={()=>void run()}>{m.run}</Button></PanelActions>
    <Progress label={m.progress} value={batch.progress?.completed??0} max={Math.max(1,sources.length)} action={batch.running?<Button size="sm" onClick={batch.cancel}>{m.cancel}</Button>:undefined}/>
    <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: error ? undefined : "hidden"}}>{m.failed}</Notice></div>
    <FileList>{sources.map((file,index)=>{const result=batch.results[index];return <FileRow key={`${index}:${file.name}`} name={file.name} size={file.size} status={result?.status==='fulfilled'?'done':result?'error':'queued'} error={result?.status==='rejected'?m.error:result?.status==='aborted'?m.aborted:undefined} onRemove={batch.running?undefined:()=>updateSources(sources.filter((_,i)=>i!==index))}/>;})}</FileList>
  </div>;
}
/** Session recipe/actions around the standalone runner. */
export interface SessionBatchPanelProps {
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Host result delivery; absent means results stay in memory only. */
  onComplete?:(results:BatchResult<Blob>[])=>unknown;
  /** Rendering parts needed to replay custom filters, stages and layer kinds. */
  sessionOptions?:Omit<import('../session/index.js').EditorSessionOptions,'source'|'recipe'>;
  /** Host word overrides. */
  labels?:Partial<FilesMessages>;
}
/** Replay the current session recipe for independent files through an intercepted batch action. */
export function SessionBatchPanel({editor,onComplete,sessionOptions,labels}:SessionBatchPanelProps) {
  const api=useImageBatch(editor);
  const render=useCallback((source:Blob,settings:BatchSettings<EditRecipe>,context:{signal?:AbortSignal})=>api.renderOne(source,{...settings,recipe:api.recipe},context,sessionOptions),[api,sessionOptions]);
  return <BatchPanel renderOne={render} runBatch={async(sources,options)=>await api.run(sources,options) as BatchResult<Blob>[]} onComplete={onComplete} labels={labels}/>;
}
export { useBatch, useImageBatch } from '../react/files.js';
