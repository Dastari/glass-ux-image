import { FileDataError } from '../formats/bytes.js';
import { sniffFormat } from '../formats/index.js';
export interface ClipboardImageItem { readonly types:readonly string[]; getType(type:string):Promise<Blob> }
export interface ImageClipboard { read():Promise<readonly ClipboardImageItem[]>; writePng(blob:Blob):Promise<void> }
/** Clipboard image access was unavailable, refused or failed. */
export class ClipboardImageError extends FileDataError {
  override name='ClipboardImageError';
}
function failure(cause:unknown):ClipboardImageError {
  const denied=cause instanceof Error&&['NotAllowedError','SecurityError'].includes(cause.name);
  return new ClipboardImageError(denied?'permission':'unsupported',denied?'Clipboard permission was refused':'Image clipboard is unavailable',{cause});
}
/** Does not preventDefault: the host decides whether a paste should be consumed. */
export function imagesFromPaste(event:{clipboardData:{files:ArrayLike<Blob>}|null}):Blob[] {
  return event.clipboardData?Array.from(event.clipboardData.files).filter(f=>f.type.startsWith('image/')):[];
}
/** Read image blobs from the browser clipboard. The host owns permission and user activation. */
export async function readClipboardImages(clipboard:ImageClipboard):Promise<Blob[]> {
  try { const out:Blob[]=[]; for(const item of await clipboard.read()) { const type=item.types.find(t=>t.startsWith('image/')); if(type) out.push(await item.getType(type)); } return out; } catch(cause) { throw failure(cause); }
}
/** Write a PNG blob to the browser clipboard; rejects unavailable or refused access. */
export async function writeClipboardPng(blob:Blob,clipboard:ImageClipboard):Promise<void> {
  if(blob.type!=='image/png'||sniffFormat(new Uint8Array(await blob.slice(0,12).arrayBuffer()))!=='png') throw new ClipboardImageError('invalid','Clipboard output must be PNG');
  try { await clipboard.writePng(blob); } catch(cause) { throw failure(cause); }
}
/** Construct only in response to a host action/user gesture, in a secure browser context. */
export function browserImageClipboard():ImageClipboard {
  return {read:()=>navigator.clipboard.read(),writePng:blob=>navigator.clipboard.write([new ClipboardItem({'image/png':blob})])};
}
