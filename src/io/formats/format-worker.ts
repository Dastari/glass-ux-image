import { decodeFormat } from './registry.js';
import { materialise } from './materialise.js';
import { pixelLimit } from './decoder.js';
import type { ImportFormat } from './index.js';
import type { TileAddress, TileSource } from '../../core/index.js';
let sources:TileSource[]=[];
// Sent only after module loading succeeds; subsequent errors must never restart decoding locally.
self.postMessage({ready:true});
self.onmessage=async({data}:MessageEvent<{blob:Blob;format:ImportFormat;maxPixels?:number}|{id:number;source:number;tile:TileAddress}>)=> {
  try {
    if('id' in data) {
      const pixels=await sources[data.source]!.readTile(data.tile);self.postMessage({id:data.id,pixels},{transfer:[pixels.data.buffer]});return;
    }
    const decoded=await decodeFormat(data.blob,data.format,{maxPixels:data.maxPixels});
    if(decoded.preview){self.postMessage({preview:decoded.preview,importInfo:decoded.importInfo});return;}
    const opened=await materialise(decoded,pixelLimit(data.maxPixels));sources=[opened,...(opened.importedLayers?.map(l=>l.source)??[])];
    self.postMessage({opened:{width:opened.width,height:opened.height,icc:opened.icc,metadata:opened.metadata,importInfo:opened.importInfo,
      importedLayers:opened.importedLayers?.map(l=>({spec:l.spec,blob:l.blob,width:l.source.width,height:l.source.height}))}});
  } catch(error) {self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
