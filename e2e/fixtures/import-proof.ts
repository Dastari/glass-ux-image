import { openImage, fileActions, snapshotSession, encodeProject, writeMetadata, type OpenImageOptions } from 'glass-ux-image/io';
import { createEditorSession, type EditorSession } from 'glass-ux-image/session';
import { concat, utf8 } from '../../src/io/formats/bytes.js';
async function ready(s:EditorSession) {while(s.state.status==='loading')await new Promise(r=>setTimeout(r,0));if(s.state.status==='failed')throw s.state.error;return s;}
async function tile(blob:Blob,options?:OpenImageOptions) {const image=await openImage(blob,options).catch(error=>{let details=String(error),cause=error.cause;while(cause){details+=': '+String(cause);cause=cause.cause;}throw new Error(details);});try {const pixels=await image.readTile({level:0,x:0,y:0});return {width:image.width,height:image.height,pixels:Array.from(pixels.data),info:image.importInfo,orientation:image.metadata?.fields.orientation};}finally {image.dispose?.();}}
function rawHeader(kind:string,orientation:number) {
  const bytes=new Uint8Array(64),v=new DataView(bytes.buffer);bytes.set([73,73,42,0,16,0,0,0]);if(kind==='cr2')bytes.set([67,82,2,0],8);if(kind==='orf')bytes.set([82,79],2);
  v.setUint16(16,2,true);v.setUint16(18,274,true);v.setUint16(20,3,true);v.setUint32(22,1,true);v.setUint16(26,orientation,true);v.setUint16(30,kind==='dng'?50706:33422,true);v.setUint16(32,1,true);v.setUint32(34,4,true);return bytes;
}
async function raw(kind:string,orientation=6) {
  const canvas=new OffscreenCanvas(8,4),ctx=canvas.getContext('2d')!;ctx.fillStyle='#f00';ctx.fillRect(0,0,4,4);ctx.fillStyle='#00f';ctx.fillRect(4,0,4,4);
  const jpeg=new Uint8Array(await (await canvas.convertToBlob({type:'image/jpeg',quality:1})).arrayBuffer());
  const small=new OffscreenCanvas(2,1);small.getContext('2d');const thumbnail=new Uint8Array(await (await small.convertToBlob({type:'image/jpeg'})).arrayBuffer());
  const exif=rawHeader('dng',orientation).slice();new DataView(exif.buffer).setUint16(16,1,true);new DataView(exif.buffer).setUint32(30,0,true);const tagged=writeMetadata(jpeg,{format:'jpeg',packets:[{kind:'exif',data:exif}],fields:{orientation},presence:{exif:true,xmp:false,iptc:false}},{mode:'preserve'});
  const prefix=kind==='raf'?utf8('FUJIFILMCCD-RAW '):kind==='cr3'?concat([new Uint8Array([0,0,0,20]),utf8('ftypcrx '),new Uint8Array(8)]):rawHeader(kind,orientation);
  return tile(new Blob([concat([prefix,thumbnail,tagged])],{type:'application/octet-stream'}));
}
async function psd(blob:Blob) {
  let saved:Blob|undefined;const actions:string[]=[],s=await ready(createEditorSession({source:blob,actions:fileActions({onProjectSave:b=>{saved=b;}}),onAction:(a,next)=>{actions.push(a.id);return next();}}));
  try {
    const layers=s.state.recipe.layers!.map(l=>({...l})),before=Array.from((await s.readPreview(64)).data),assetIds=s.assets.entries.map(a=>a.id);
    s.run('layers.update',{id:layers[1]!.id,patch:{visible:false}});s.undo();
    await s.run('file.project.save');await s.run('file.project.open',saved);
    const after=Array.from((await s.readPreview(64)).data);const equal=before.every((v,i)=>v===after[i]);
    // Empty layers in a saved project means the user deleted them all, not "import again".
    s.run('layers.set',[]);const empty=await encodeProject(await snapshotSession(s));await s.run('file.project.open',empty);
    return {layers,assetIds,equal,remaining:s.state.recipe.layers!.length,actions};
  } finally {s.dispose();}
}
async function jpegTiff(header:number[]) {
  const canvas=new OffscreenCanvas(3,2),context=canvas.getContext('2d')!;context.fillStyle='#f00';context.fillRect(0,0,3,2);
  const jpeg=new Uint8Array(await (await canvas.convertToBlob({type:'image/jpeg',quality:1})).arrayBuffer()),bytes=new Uint8Array(256+jpeg.length);bytes.set(header.slice(0,256));bytes.set(jpeg,256);const view=new DataView(bytes.buffer);
  // Replace RGBA with RGB JPEG, including matching sample depths and removal of the alpha tag.
  view.setUint32(8+2+2*12+4,3,true);view.setUint16(8+2+11*12,65000,true);
  view.setUint16(8+2+3*12+8,7,true);view.setUint16(8+2+7*12+8,3,true);view.setUint32(8+2+9*12+8,jpeg.length,true);
  return tile(new Blob([bytes]));
}
const proof={tile,raw,psd,jpegTiff,async heif(peer:boolean) {
  const blob=new Blob([new Uint8Array([0,0,0,20]),utf8('ftypheic'),new Uint8Array(8)]);let loads=0;
  try {const result=await tile(blob,peer?{loadHeif:async()=>{loads++;return {decode:async()=>({width:1,height:1,rgba:new Uint8Array([255,0,0,255])})};}}:{});return {ok:true,loads,result};}
  catch(error) {return {ok:false,loads,error:String(error)};}
}};
Object.assign(window,{importProof:proof});
export type ImportProof=typeof proof;
