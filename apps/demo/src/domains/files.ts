import { exportTool, metadataTool, batchTool, filesTool } from 'glass-ux-image/tools/export';
import type { ImageTool } from 'glass-ux-image/react';
/** All file tools; hosts can import any panel or tool independently. */
export const filesTools:readonly ImageTool[]=[filesTool,exportTool,metadataTool,batchTool];

// Opt-in browser fixture. Ordinary demo hosts import only the public tools above.
import { createElement, useCallback, useEffect, useState } from 'react';
import { ImageEditorProvider } from 'glass-ux-image/react';
import { createEditorSession, type EditorSession } from 'glass-ux-image/session';
import { SessionExportPanel } from 'glass-ux-image/panels/export';
import { SessionMetadataPanel } from 'glass-ux-image/panels/metadata';
import { SessionBatchPanel } from 'glass-ux-image/panels/batch';
import { FilesPanel } from 'glass-ux-image/tools/export';
import { openImage, exportFormatSupport, readImageDpi, readMetadata, writeMetadata, indexedDbAutosaveStore, attachSessionFiles, autosaveSession, readProject, imageDimensions, type AutosaveStore } from 'glass-ux-image/io';
import { AvifEncoder } from 'glass-ux-image/codecs/avif';
import { memoryFiles } from 'glass-ux/file-provider/memory';

async function picture(type='image/png',width=16,height=12,colour='#e04020') {
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d')!;ctx.fillStyle=colour;ctx.fillRect(width/2,0,width/2,height);return canvas.convertToBlob({type});
}
async function pixels(blob:Blob) {const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();return {width:canvas.width,height:canvas.height,bytes:Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data)};}
async function wait(session:EditorSession) {while(session.state.status==='loading')await new Promise(r=>setTimeout(r,0));if(session.state.status==='failed')throw session.state.error;}
interface FilesProof {
 session:EditorSession;store:AutosaveStore;actions:string[];exported?:Blob;project?:Blob;
 initialise():Promise<void>;formats:typeof exportFormatSupport;
 importFormat(type:string):Promise<{width:number;height:number;frames:number}>;
 exportFormat(type:string,alpha:boolean):Promise<{type:string;alpha:number;width:number;height:number;size:number}>;
 metadataRoundTrip(type:string,mode:'preserve'|'strip'|'strip-gps'):Promise<{exif:boolean;orientation?:number;gps:boolean}>;
 dpiRoundTrip(type:string,mode:'preserve'|'strip'):Promise<{dpi:{x:number;y:number}|null;exif:boolean}>;
 projectRoundTrip():Promise<{equal:boolean;assets:string[];layers:number}>;
 persist():Promise<number>;recover():Promise<number>;pasteDrop(kind:'paste'|'drop'):Promise<number>;
 batch():Promise<string[]>;cspProbe():Promise<boolean>;dimensionsBomb():Promise<boolean>;
}
declare global {interface Window {filesProof:FilesProof}}
let proofPromise:Promise<FilesProof>|undefined;
async function makeProof():Promise<FilesProof> {
 const source=await picture(),store=await indexedDbAutosaveStore('glass-image-files-proof');
 const actions:string[]=[];
 const session=createEditorSession({source,onAction:(action,next)=>{actions.push(action.id);return next();},onExport:blob=>{proof.exported=blob;}});
 await wait(session);
 let saved:ReturnType<typeof autosaveSession>|undefined;
 const proof:FilesProof={session,store,actions,initialise:async()=>{},formats:exportFormatSupport,
 async importFormat(type) {let blob:Blob;
  if(type==='image/gif')blob=new Blob([new Uint8Array([71,73,70,56,57,97,1,0,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59])],{type});
  else if(type==='image/svg+xml')blob=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="red"/></svg>'],{type});
  else blob=await picture(type);
  await session.run('file.open',blob);return {width:session.state.sourceSize!.width,height:session.state.sourceSize!.height,frames:session.original?.frameCount??1}; },
 async exportFormat(type,alpha) {await session.run('file.open',source);const blob=await session.run('file.export',{type,alpha,quality:.9}) as Blob;const data=await pixels(blob);return {type:blob.type,alpha:data.bytes[3]!,width:data.width,height:data.height,size:blob.size};},
 async metadataRoundTrip(type,mode) {
  const exif=new Uint8Array(26),v=new DataView(exif.buffer);exif.set([73,73]);v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,1,true);v.setUint16(10,274,true);v.setUint16(12,3,true);v.setUint32(14,1,true);v.setUint16(18,6,true);
  const original=await picture(type);const metadata={format:'jpeg' as const,packets:[{kind:'exif' as const,data:exif}],fields:{orientation:6},presence:{exif:true,xmp:false,iptc:false}};
  const blob=new Blob([writeMetadata(new Uint8Array(await original.arrayBuffer()),metadata,{mode:'preserve'}).slice()],{type});await session.run('file.open',blob);const output=await session.result().toBlob({type,metadata:mode});const parsed=readMetadata(new Uint8Array(await output.arrayBuffer()));return {exif:parsed.presence.exif,orientation:parsed.fields.orientation,gps:!!parsed.fields.gps};
 },
 async dpiRoundTrip(type,mode) {await proof.metadataRoundTrip(type,'preserve');session.setGeometry({resize:{width:16,height:12,dpi:300}});const blob=await session.result().toBlob({type,metadata:mode});const bytes=new Uint8Array(await blob.arrayBuffer());return {dpi:readImageDpi(bytes),exif:readMetadata(bytes).presence.exif};},
 async projectRoundTrip() {await session.run('file.open',source);const blob=await picture('image/png',8,8,'#20c060'),asset=await session.assets.add(blob,await openImage(blob));
  session.setLayers([{id:'overlay',asset,kind:'image',name:'Overlay',visible:true,opacity:.7,blend:'screen',quad:[[2,2],[12,1],[14,10],[1,11]]}]);session.setGeometry({resize:{width:20,height:15}});
  const before=await pixels(await session.result().toBlob({type:'image/png'}));await session.run('file.project.save');await session.run('file.open',source);await session.run('file.project.open',proof.project!);const after=await pixels(await session.result().toBlob({type:'image/png'}));return {equal:JSON.stringify(before)===JSON.stringify(after),assets:session.assets.entries.map(a=>a.id),layers:session.state.recipe.layers!.length};
 },
 async persist() {saved??=autosaveSession(session,store,'reload-proof');await session.run('file.open',source);session.setGeometry({resize:{width:23,height:17}});await saved.flush();return (await store.list()).length;},
 async recover() {const record=await store.get('reload-proof');if(!record)throw new Error('Missing snapshot');await session.run('file.recover',readProject(new Uint8Array(await record.data.arrayBuffer())));return session.state.size!.width;},
 async pasteDrop(kind) {const blob=await picture('image/png',kind==='paste'?18:19,10);if(kind==='paste') {const event={clipboardData:{files:[blob]}};await session.run('file.paste',event);}else await session.run('file.drop',[blob]);return session.state.size!.width;},
 async batch() {const blobs=[source,new Blob(['broken'],{type:'image/png'}),source];const {renderBatchImage}=await import('glass-ux-image/io');const results=await session.run('file.batch',{sources:blobs,options:{settings:{format:'image/webp',width:8,height:6},concurrency:2,renderOne:renderBatchImage}}) as {status:string}[];return results.map(r=>r.status);},
 async cspProbe() {const codec=new AvifEncoder();try{return await codec.available();}finally{codec.dispose();}},
 async dimensionsBomb() {const blob=await picture();const bytes=new Uint8Array(await blob.arrayBuffer());new DataView(bytes.buffer).setUint32(16,100000);try{await openImage(new Blob([bytes]));return false;}catch{return imageDimensions(bytes)!.width===100000;}},
 };
 attachSessionFiles(session,{onProjectSave:blob=>{proof.project=blob;},clipboard:{read:async()=>[],writePng:async blob=>{proof.exported=blob;}}});
 window.filesProof=proof;return proof;
}
export function FilesFixture() {
 const [proof,setProof]=useState<FilesProof>();const [batchCount,setBatchCount]=useState(0);
 useEffect(()=>{void (proofPromise??=makeProof()).then(setProof);},[]);
 const projectSave=useCallback((blob:Blob)=>{if(proof)proof.project=blob;},[proof]);
 if(!proof)return null;
 return createElement(ImageEditorProvider,{editor:proof.session},createElement('section',{'data-testid':'files-fixture','aria-label':'File parts'},
  createElement(FilesPanel,{providers:[memoryFiles({}, {label:'Memory'})],onProjectSave:projectSave,autosaveStore:proof.store,autosaveId:'ui-proof'}),
  createElement(SessionExportPanel,{defaultValue:{type:'image/png',width:16,height:12}}),
  createElement(SessionMetadataPanel),
  createElement(SessionBatchPanel,{onComplete:results=>setBatchCount(results.length)}),
  createElement('output',{'data-testid':'batch-count'},batchCount)
 ));
}
if(new URLSearchParams(location.search).has('files-test')) {
 void import('./colour-proof.js');
 // The file tools remain ordinary public tools; only this demo fixture swaps their panel.
 (filesTools as ImageTool[])[0]={...filesTool,Panel:FilesFixture};
}
