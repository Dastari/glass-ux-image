import { ImageEditor } from 'glass-ux-image/editor';
import { develop } from 'glass-ux-image/tools/develop';
import type { ImageInput } from 'glass-ux-image/io';
const tools=[develop];
/** A develop-only workspace; it imports no layers, retouch or effects tools. */
export function DevelopView({src}:{src:ImageInput}){return <ImageEditor src={src} tools={tools}/>;}
