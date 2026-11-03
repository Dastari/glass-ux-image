import { PhotoEditorView, PhotoEditorActions } from 'glass-ux-image/photo-editor';
import { useImageEditor } from 'glass-ux-image/react';
import { basic } from 'glass-ux-image/kits/basic';
import { WindowFrame } from 'glass-ux/windows';
import { useMessages } from 'glass-ux/i18n';
import { workspaceMessages } from 'glass-ux-image/messages/workspace';
import type { ImageInput } from 'glass-ux-image/io';
import type { EditResult } from 'glass-ux-image/session';
/** Presentational window. A host may mount this body in its managed window system. */
export function ProductPhoto({src,onSave}:{src:ImageInput;onSave:(result:EditResult)=>unknown}){
  const editor=useImageEditor({source:src,tools:basic,onSave}),m=useMessages(workspaceMessages);
  return <WindowFrame.Root focused className="mx-auto h-full w-full max-w-5xl"><WindowFrame.AppBar title={m.product} actions={<PhotoEditorActions editor={editor}/>}/><WindowFrame.Body variant="fill"><PhotoEditorView editor={editor} tools={basic} header={false}/></WindowFrame.Body></WindowFrame.Root>;
}
