import { ImageEditor } from 'glass-ux-image/editor';
import { standard } from 'glass-ux-image/kits/standard';
import { advanced } from 'glass-ux-image/kits/advanced';
import type { ImageInput } from 'glass-ux-image/io';
const tools=[...new Map([...standard,...advanced].map(tool=>[tool.id,tool])).values()];
/** Complete suite with host-selected file delivery. */
export function FullSuite({src}:{src:ImageInput}){return <ImageEditor src={src} tools={tools}/>;}
