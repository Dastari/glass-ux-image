import { bounded } from './bytes.js';
import type { DecodedRaster } from './decoder.js';
/** Lossless unassociated RGBA TIFF asset. Avoid canvas's premultiply/unpremultiply rounding. */
export function layerAsset(raster:DecodedRaster):Blob {
  const {width,height,rgba,icc}=raster,dataAt=208,profileAt=dataAt+rgba.length;
  const entries:[number,number,number,number][]=[
    [256,4,1,width],[257,4,1,height],[258,3,4,192],[259,3,1,1],[262,3,1,2],
    [273,4,1,dataAt],[277,3,1,4],[278,4,1,height],[279,4,1,rgba.length],[284,3,1,1],[338,3,1,2]
  ];
  if(icc)entries.push([34675,7,icc.bytes.length,profileAt]);
  const bytes=bounded(new Uint8Array(profileAt+(icc?.bytes.length??0))),view=new DataView(bytes.buffer);bytes.set([73,73,42,0,8,0,0,0]);view.setUint16(8,entries.length,true);
  entries.forEach(([tag,type,count,value],i)=>{const p=10+i*12;view.setUint16(p,tag,true);view.setUint16(p+2,type,true);view.setUint32(p+4,count,true);if(type===3&&count===1)view.setUint16(p+8,value,true);else view.setUint32(p+8,value,true);});
  for(let i=0;i<4;i++)view.setUint16(192+i*2,8,true);bytes.set(rgba,dataAt);if(icc)bytes.set(icc.bytes,profileAt);
  return new Blob([bytes.slice()],{type:'image/tiff'});
}
