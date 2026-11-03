import { Notice } from 'glass-ux/notice';
import { useCallback, useEffect, useState } from 'react';
import { Button, ActionButton } from 'glass-ux/button';
import { FileDrop } from 'glass-ux/file-drop';
import { IconClipboard, IconCopy, IconFolderOpen } from 'glass-ux/icons';
import { FileDialog } from 'glass-ux/file-dialog';
import type { FileProvider } from 'glass-ux/file-provider';
import { useMessages } from 'glass-ux/i18n';
import { filesMessages, type FilesMessages } from '../../messages/files.js';
import { useImageFiles, useImageAutosave } from '../../react/files.js';
import { readProviderImage, type SessionFilesOptions } from '../../io/session-files.js';
import { decodeProject } from '../../io/project/async.js';
import { listRecovery, type AutosaveStore, type RecoveryCandidate } from '../../io/autosave/index.js';
import type { EditorSession } from '../../session/index.js';
/** Shared file controls over an explicit or nearest editor. Persistence is entirely opt-in. */
export interface FilesPanelProps extends SessionFilesOptions {
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Glass UX storage providers, already authenticated by the host. */
  providers?:readonly FileProvider[];
  /** Optional autosave adapter. Absent means no autosave or recovery access. */
  autosaveStore?:AutosaveStore;
  /** Host-owned recovery key within its adapter. */
  autosaveId?:string;
  /** Host word overrides. */
  labels?:Partial<FilesMessages>;
}
/** Session-bound open, clipboard, native project and recovery actions supplied by host file adapters. */
export function FilesPanel({editor,providers=[],autosaveStore,autosaveId='document',labels,...options}:FilesPanelProps) {
  const files=useImageFiles(editor,options),m=useMessages(filesMessages,{labels});
  const [browse,setBrowse]=useState(false),[failed,setFailed]=useState(false),[recovery,setRecovery]=useState<RecoveryCandidate[]>([]);
  const onError=useCallback(()=>setFailed(true),[]),autosave=useImageAutosave(autosaveStore,autosaveId,files.session,onError);
  useEffect(()=> {let live=true;if(autosaveStore)void listRecovery(autosaveStore,decodeProject).then(list=>{if(live)setRecovery(list);}).catch(onError);return ()=>{live=false;};},[autosaveStore,onError]);
  const perform=(run:()=>unknown)=> {setFailed(false);void Promise.resolve().then(run).catch(onError);};
  const open=async(blob:Blob,dropped=false)=> {const signature=new Uint8Array(await blob.slice(0,4).arrayBuffer());if(signature[0]===80&&signature[1]===75)await files.openProject(blob);else if(dropped)await files.drop([blob]);else await files.open(blob);};
  return <div className="gi-panel gi-files" onPaste={event=> {if(event.clipboardData.files.length){event.preventDefault();const pasted={clipboardData:{files:Array.from(event.clipboardData.files)}};perform(()=>files.paste(pasted));}}}>
    <FileDrop aria-label={m.drop} accept="image/*,.guxi" maxFiles={1} maxSize={256*1024*1024} onFiles={(accepted,rejected)=>{if(rejected.length)setFailed(true);if(accepted[0])perform(()=>open(accepted[0]!,true));}}/>
    <div className="gi-files-actions">
      <Button size="sm" variant="secondary" icon={<IconFolderOpen/>} onClick={()=>setBrowse(true)}>{m.browse}</Button>
      <ActionButton size="sm" variant="secondary" icon={<IconClipboard/>} pendingLabel={m.pending} successLabel={m.done} errorLabel={m.error} onError={onError} onAction={async()=>{setFailed(false);await files.paste();}}>{m.paste}</ActionButton>
      <ActionButton size="sm" variant="secondary" icon={<IconCopy/>} pendingLabel={m.pending} successLabel={m.done} errorLabel={m.error} onError={onError} onAction={async()=>{setFailed(false);await files.copy();}}>{m.copy}</ActionButton>
      {options.onProjectSave&&<ActionButton size="sm" pendingLabel={m.pending} successLabel={m.done} errorLabel={m.error} onError={onError} onAction={async()=>{setFailed(false);await files.saveProject();}}>{m.projectSave}</ActionButton>}
      {autosaveStore&&<ActionButton size="sm" pendingLabel={m.pending} successLabel={m.done} errorLabel={m.error} onError={onError} onAction={async()=>{await autosave.flush();setRecovery(await listRecovery(autosaveStore,decodeProject));}}>{m.autosave}</ActionButton>}
    </div>
    <FileDialog mode="open" title={m.open} open={browse} onOpenChange={setBrowse} providers={providers} device accept="image/*,.guxi" onOpen={async(selection,{signal})=> {const first=selection.files[0];if(!first)return;if('provider' in selection)await open(await readProviderImage(selection.provider,first as import('glass-ux/file-provider').FileStat,signal));else await open(first as File);}}/>
    {recovery.map(candidate=><ActionButton key={candidate.id} size="sm" pendingLabel={m.pending} successLabel={m.done} errorLabel={m.error} onError={onError} onAction={async()=>{setFailed(false);await files.recover(await candidate.recover());}}>{m.recover} · {candidate.id}</ActionButton>)}
    <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: failed ? undefined : "hidden"}}>{m.failed}</Notice></div>
  </div>;
}
export { useImageFiles, useImageAutosave } from '../../react/files.js';
