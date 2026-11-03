import { Surface } from 'glass-ux/surface';
import { useMessages } from 'glass-ux/i18n';
import { PhotoEditor } from 'glass-ux-image/photo-editor';
import { brush } from 'glass-ux-image/tools/retouch/brush';
import { text } from 'glass-ux-image/tools/text';
import { workspaceMessages } from 'glass-ux-image/messages/workspace';
import type { ImageInput } from 'glass-ux-image/io';
const tools=[brush,text];
/** Annotation composition using public painting and text tools. */
export function Annotator({src}:{src:ImageInput}){
  const m=useMessages(workspaceMessages);
  return <Surface material="panel" radius="surface" className="h-full overflow-hidden"><PhotoEditor src={src} tools={tools} title={m.annotator}/></Surface>;
}
