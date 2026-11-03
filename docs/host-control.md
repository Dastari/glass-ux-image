# Host control

The host decides what Save means. onSave receives a lazy EditResult and a cancellation signal. Encoding starts only when the host calls toBlob. Progress reports delivery, not a guessed completion time.

## Save through the host

```tsx
import { PhotoEditor } from 'glass-ux-image/photo-editor';
import { crop } from 'glass-ux-image/tools/crop';
export function ControlledPhoto({src,deliver}: {src: Blob; deliver: (blob:Blob,signal:AbortSignal)=>Promise<void>}) {
  return <PhotoEditor src={src} tools={[crop]} onSave={async(result,{signal,setProgress})=>{
    const blob = await result.toBlob({type:'image/webp',quality:0.82,signal});
    setProgress(null);
    await deliver(blob,signal);
    setProgress(1);
  }} onAction={(action,next)=> action.id === 'edit.reset' ? undefined : next()}/>;
}
```

onAction can refuse, replace arguments or wrap any committed action. A drag preview bypasses it; the eventual commit does not. Use session.run for commands, preview for transient state, commit for a history entry, and revert to abandon a draft. Do not mutate state or recipes in place. History branches remain available through useImageHistory and HistoryPanel.

```tsx
import { useImageEditor, useSessionState } from 'glass-ux-image/react';
import { PhotoEditorView } from 'glass-ux-image/photo-editor';
import { basic } from 'glass-ux-image/kits/basic';
export function Host({src}: {src:Blob}) {
  const editor=useImageEditor({source:src,tools:basic,actions:[{id:'host.rotate',run:s=>s.run('image.rotateRight')}]});
  const state=useSessionState(editor);
  return <><button disabled={!state.canUndo} onClick={()=>editor.run('edit.undo')}>Undo</button>
    <PhotoEditorView editor={editor} tools={basic}/></>;
}
```

Recipes are serialisable geometry, filters, layers and strokes. Supply recipe to resume an edit and onChange to observe committed changes. onDirtyChange reports save state. Actions can replace or hide built-ins by id. ImageEditor commands are Glass UX action definitions for menus and the command palette. Its shortcuts map action ids to keys; null or an empty list disables a binding. They are scoped to the editor. View props expose controlled workspace and filmstrip selection; plain controls expose value/defaultValue pairs. Consult each API before choosing which state the host owns.
