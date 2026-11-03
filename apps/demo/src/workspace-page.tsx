import { IconSun, IconContrast, IconMoon, IconUpload } from 'glass-ux/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from 'glass-ux/badge';
import { Button } from 'glass-ux/button';
import { Notice } from 'glass-ux/notice';
import { useMessages } from 'glass-ux/i18n';
import { ImageEditorView, type OpenPicture, type ImageWorkspace } from 'glass-ux-image/editor';
import { createEditorSession, type EditorSession } from 'glass-ux-image/session';
import { attachSessionFiles, autosaveSession, opfsAutosaveStore, indexedDbAutosaveStore, listRecovery, decodeProject, imagesFromPaste, type AutosaveStore, type RecoveryCandidate } from 'glass-ux-image/io';
import { filesTool, exportTool, metadataTool, batchTool } from 'glass-ux-image/tools/export';
import { standard } from 'glass-ux-image/kits/standard';
import { advanced } from 'glass-ux-image/kits/advanced';
import { cinematicLooks } from 'glass-ux-image/filters/effects';
import { effectsMessages } from 'glass-ux-image/messages/effects';
import { workspaceMessages } from 'glass-ux-image/messages/workspace';
import sampleUrl from './assets/sample.png?url';
import './workspace-page.css';
import { createId } from "glass-ux-image/core";

const shortcutOverrides={"edit.undo":"alt+z","view.pan":"p"};
const tools=[...new Map([...standard,...advanced,filesTool,exportTool,metadataTool,batchTool].map(t=>[t.id,t])).values()];
/** Host-only download policy; the library merely hands back blobs. */
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
/** Browser application: sessions, persistence and downloads belong here, outside the library. */
export function WorkspacePage(){
  const m=useMessages(workspaceMessages),effectsWords=useMessages(effectsMessages),[pictures,setPictures]=useState<OpenPicture[]>([]),[selected,setSelected]=useState<string|null>(null),[workspace,setWorkspace]=useState<ImageWorkspace>(),[store,setStore]=useState<AutosaveStore>(),[recovery,setRecovery]=useState<RecoveryCandidate[]>([]),[failed,setFailed]=useState(false);
  const picker=useRef<HTMLInputElement>(null);
  const sessions=useRef(new Map<string,{session:EditorSession;dispose:()=>void;startAutosave:(store:AutosaveStore)=>void}>()), currentStore=useRef(store);currentStore.current=store;
  const add=useCallback((source:Blob,label:string,id=createId())=>{
    const session=createEditorSession({source,tools,onSave:async(result,{signal})=>download(await result.toBlob({type:'image/png',signal}),`${label}.png`),onExport:blob=>download(blob,`${label}.${blob.type.split('/')[1]??'png'}`),onError:()=>setFailed(true)});
    const detach=attachSessionFiles(session,{onProjectSave:blob=>download(blob,`${label}.guxi`)});
    const thumb=source instanceof Blob?URL.createObjectURL(source):undefined;
    // An adapter is explicitly opted into by this host, and only encoded source blobs are recoverable.
    let autosave:ReturnType<typeof autosaveSession>|undefined;
    const startAutosave=(adapter:AutosaveStore)=>{if(!autosave&&source instanceof Blob)autosave=autosaveSession(session,adapter,id,()=>setFailed(true));};
    if(currentStore.current)startAutosave(currentStore.current);
    sessions.current.set(id,{session,startAutosave,dispose:()=>{autosave?.dispose();detach();session.dispose();if(thumb)URL.revokeObjectURL(thumb);}});
    setPictures(old=>[...old,{id,label,editor:session,thumbnail:thumb}]);setSelected(id);return session;
  },[]);
  useEffect(()=>{
    let active=true;
    void (async()=>{let adapter:AutosaveStore;
      try {const root=await navigator.storage.getDirectory();adapter=opfsAutosaveStore(await root.getDirectoryHandle('glass-image-demo',{create:true}));}
      catch {adapter=await indexedDbAutosaveStore('glass-image-demo');}
      const candidates=await listRecovery(adapter,decodeProject);if(active){setStore(adapter);setRecovery(candidates);}
    })().catch(()=>{if(active)setFailed(true);});
    // Generated from scene.ts at development time; encoded bytes make the sample recoverable too.
    void fetch(sampleUrl).then(response=>response.blob()).then(blob=>{if(active)add(blob,m.original);}).catch(()=>{if(active)setFailed(true);});
    const owned=sessions.current;
    return ()=>{active=false;for(const item of owned.values())item.dispose();owned.clear();};
  },[add,m.original]);
  useEffect(()=>{if(store)for(const item of sessions.current.values())item.startAutosave(store);},[store,pictures]);
  const picture=pictures.find(p=>p.id===selected);
  const open=(files:readonly Blob[])=>{for(const file of files){
    const label=file instanceof File?file.name:m.original;
    if(file instanceof File&&file.name.toLowerCase().endsWith('.guxi'))void decodeProject(file).then(async project=>{const ref=project.manifest.source,source=new Blob([project.blobs.get(ref.path)!.slice()],{type:ref.mime});await add(source,label).run('file.recover',project);}).catch(()=>setFailed(true));
    else add(file,label);
  }};
  const recover=async(candidate:RecoveryCandidate)=>{
    try {const project=await candidate.recover(),ref=project.manifest.source,source=new Blob([project.blobs.get(ref.path)!.slice()],{type:ref.mime});const session=add(source,m.recover);await session.run('file.recover',project);setRecovery(old=>old.filter(c=>c.id!==candidate.id));}
    catch {setFailed(true);}
  };
  // The test surface is host instrumentation, not a library dependency.
  useEffect(()=>{window.__workspaceDemo={pictures,selected,workspace};return ()=>{delete window.__workspaceDemo;};},[pictures,selected,workspace]);
  return <div className="workspace-host" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();open(Array.from(e.dataTransfer.files));}}} onPaste={e=>{const files=imagesFromPaste(e.nativeEvent);if(files.length){e.preventDefault();open(files);}}}>
    <div className="workspace-host-bar">
      <Button variant="secondary" size="sm" icon={<IconUpload/>} onClick={()=>picker.current?.click()}>{m.open}</Button>
      <input ref={picker} type="file" multiple accept="image/*,.guxi" hidden aria-label={m.open} onChange={e=>{const files=Array.from(e.currentTarget.files??[]);if(files.length)open(files);e.currentTarget.value='';}}/>
      {recovery[0]&&<Notice compact action={<Button size="sm" onClick={()=>void recover(recovery[0]!)}>{m.recover}</Button>}>{m.recovery}</Notice>}
      <span role="status" className="workspace-host-status"><Badge size="sm" tone={failed?'danger':store?'success':'neutral'} marker="dot">{failed?m.failed:store?m.autosave:m.noAutosave}</Badge></span>
    </div>
    {picture&&<ImageEditorView editor={picture.editor} tools={tools} title={picture.label} shortcuts={new URLSearchParams(location.search).has("shortcuts-test")?shortcutOverrides:undefined} presets={cinematicLooks.map((preset,index)=>({id:preset.id,icon:[<IconSun/>,<IconContrast/>,<IconMoon/>][index],label:[effectsWords.warmFilm,effectsWords.silverScreen,effectsWords.softCinema][index]!,change:{filters:preset.filters}}))} pictures={pictures} selectedPictureId={selected} onSelectedPictureIdChange={setSelected} workspace={workspace} onWorkspaceChange={setWorkspace} backend={new URLSearchParams(location.search).get('backend')==='cpu'?'cpu':'auto'}/>}
  </div>;
}
declare global {interface Window {__workspaceDemo?:{pictures:OpenPicture[];selected:string|null;workspace:ImageWorkspace|undefined}}}
