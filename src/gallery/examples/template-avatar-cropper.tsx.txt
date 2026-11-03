import { Surface } from 'glass-ux/surface';
import { useMessages } from 'glass-ux/i18n';
import { PhotoEditor } from 'glass-ux-image/photo-editor';
import { crop } from 'glass-ux-image/tools/crop';
import { workspaceMessages } from 'glass-ux-image/messages/workspace';
import type { ImageInput } from 'glass-ux-image/io';
import type { EditResult } from 'glass-ux-image/session';
const tools=[{...crop,enter:(session:import('glass-ux-image/session').EditorSession)=>{session.setToolData('crop','square');crop.enter?.(session);const size=session.state.sourceSize;if(size){const edge=Math.min(size.width,size.height);session.preview({geometry:{...session.state.recipe.geometry,crop:{x:(size.width-edge)/2,y:(size.height-edge)/2,width:edge,height:edge}}});}}}];
/** The host chooses its destination and may resize the exported avatar. */
export function AvatarCropper({src,onSave}:{src:ImageInput;onSave:(result:EditResult)=>unknown}){
  const m=useMessages(workspaceMessages);
  return <Surface material="panel" radius="surface" className="mx-auto h-full w-full max-w-4xl overflow-hidden"><PhotoEditor src={src} tools={tools} title={m.avatar} onSave={onSave}/></Surface>;
}
