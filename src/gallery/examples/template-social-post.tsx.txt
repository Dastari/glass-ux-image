import { Surface } from 'glass-ux/surface';
import { useMessages } from 'glass-ux/i18n';
import { PhotoEditor } from 'glass-ux-image/photo-editor';
import { basic } from 'glass-ux-image/kits/basic';
import { text } from 'glass-ux-image/tools/text';
import { workspaceMessages } from 'glass-ux-image/messages/workspace';
import type { ImageInput } from 'glass-ux-image/io';
const tools=[...basic,text];
/** Text remains editable as a layer in the recipe. */
export function SocialPost({src}:{src:ImageInput}){
  const m=useMessages(workspaceMessages);
  return <Surface material="panel" radius="surface" className="h-full overflow-hidden"><PhotoEditor src={src} tools={tools} title={m.social}/></Surface>;
}
