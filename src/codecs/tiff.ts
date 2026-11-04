import UTIF from 'utif2';
import { ensure, range, u16 } from '../io/formats/bytes.js';
import { rawTiff, tiffDirectories, tiffOrientation } from '../io/formats/tiff-directory.js';
import { pixelLimit, validateRaster, type DecodedFormat } from '../io/formats/decoder.js';
import { checkPackBits, checkTiffJpeg, inflateTiffLzw } from '../io/formats/tiff-payload.js';
import { describeIcc } from '../io/metadata/icc.js';
/** Baseline/common compressed TIFF. First page only; UTIF converts 16-bit samples to 8-bit RGBA. */
export async function decodeTiff(bytes:Uint8Array,maxPixels?:number):Promise<DecodedFormat> {
  const limit=pixelLimit(maxPixels),directories=tiffDirectories(bytes);
  if(rawTiff(directories)) {
    const {extractRawPreview}=await import('./raw.js');const {jpeg}=extractRawPreview(bytes,limit);
    return {width:1,height:1,rgba:new Uint8Array(),preview:jpeg,importInfo:{kind:'raw-preview'}};
  }
  const root=directories[0];ensure(root,'Missing TIFF page');
  const width=root.get(256)?.[0]??0,height=root.get(257)?.[0]??0;validateRaster({width,height},limit);
  const bits=root.get(258)?.[0]??1,samples=root.get(277)?.[0]??1,photo=root.get(262)?.[0]??(bits===1?0:2),compression=root.get(259)?.[0]??1;
  ensure([1,2,4,8,16].includes(bits)&&samples>=1&&samples<=4,'Unsupported TIFF sample layout');
  ensure(!root.has(258)||(root.get(258)!.length===samples&&root.get(258)!.every(n=>n===bits)),'Invalid TIFF sample depths');
  ensure((root.get(284)?.[0]??1)===1,'Separate TIFF planes are unsupported');
  ensure(!root.has(339)||(root.get(339)!.length===samples&&root.get(339)!.every(n=>n===1)),'Only unsigned TIFF samples are supported');
  ensure([1,5,7,8,32946,32773].includes(compression),'Unsupported TIFF compression');
  ensure((photo===0&&[1,4,8,16].includes(bits)&&samples<=2)||(photo===1&&[1,2,8,16].includes(bits)&&samples<=2)||
    (photo===2&&bits>=8&&samples>=3)||(photo===3&&bits<=8&&samples===1)||(photo===6&&compression===7&&bits===8&&samples===3),'Unsupported TIFF photometric/sample combination');
  ensure(samples!==2||bits>=8,'Unsupported TIFF grey alpha');
  if(photo===3)ensure(root.get(320)?.length===3*(1<<bits),'Invalid TIFF colour map');
  const predictor=root.get(317)?.[0]??1;ensure(predictor===1||(predictor===2&&bits>=8&&compression!==7),'Unsupported TIFF predictor');
  ensure([1,2].includes(root.get(266)?.[0]??1),'Unsupported TIFF fill order');
  if(root.has(338))ensure(root.get(338)!.length===samples-(photo===2?3:1)&&root.get(338)!.every(n=>n===1||n===2),'Invalid TIFF alpha layout');
  tiffOrientation([root]);
  const tiled=[322,323,324,325].some(tag=>root.has(tag));
  const tw=tiled?root.get(322)?.[0]??0:width,th=tiled?root.get(323)?.[0]??0:Math.min(root.get(278)?.[0]??height,height);
  ensure(tw>0&&th>0&&tw*th<=64*1024*1024,'Invalid TIFF strip/tile dimensions');
  if(tiled)ensure(tw%16===0&&th%16===0,'Invalid TIFF tile alignment');
  if(root.has(278))ensure(root.get(278)![0]!>0,'Invalid TIFF rows per strip');
  const offsets=root.get(tiled?324:273),counts=root.get(tiled?325:279),expected=tiled?Math.ceil(width/tw)*Math.ceil(height/th):Math.ceil(height/th);
  ensure(offsets&&counts&&offsets.length===expected&&counts.length===expected,'Invalid TIFF strip/tile count');
  const sizes=Array.from(offsets,(_,i)=>Math.ceil(tw*bits*samples/8)*(tiled?th:Math.min(th,height-i*th)));
  const cap=Math.min(512*1024*1024,Math.max(limit*32,1024*1024));
  ensure(sizes.reduce((a,n)=>a+n,0)<=cap,'TIFF tiles exceed memory limit');
  // Validate every payload before any raster allocation, including UTIF's implicit uncompressed count.
  for(let i=0;i<offsets.length;i++) {
    const at=offsets[i]!,n=counts[i]!;ensure(n>0,'Empty TIFF strip');range(bytes,at,n);
    if(compression===1){ensure(n===sizes[i],'Invalid TIFF uncompressed strip size');range(bytes,at,sizes[i]!);}
    if(compression===32773)checkPackBits(bytes.subarray(at,at+n),sizes[i]!);
    if(compression===7){ensure(bits===8&&samples===3,'Unsupported TIFF JPEG samples');checkTiffJpeg(bytes.subarray(at,at+n),tw,tiled?th:Math.min(th,height-i*th));}
  }
  if(root.has(347)){const tables=root.get(347)!;ensure(tables instanceof Uint8Array,'Invalid TIFF JPEG tables');checkTiffJpeg(tables,0,0,true);}
  // Do not call UTIF.decode: its metadata parser recursively follows private pointers and
  // materialises rational arrays. Only these validated raster fields reach the decoder.
  const page={} as ReturnType<typeof UTIF.decode>[number];
  for(const tag of [256,257,258,259,262,266,273,277,278,279,284,317,320,322,323,324,325,338,339,347]) {
    const value=root.get(tag);if(value)page[`t${tag}`]=value;
  }
  page.t262=[photo];page.t277=[samples];page.t258=Array.from({length:samples},()=>bits);
  let buffer:ArrayBuffer=bytes.slice().buffer;const ifds=[page];
  // utif2's UMD conditional require leaves pako undefined in some browser bundlers. Native
  // streaming inflate bounds output to the exact strip size before UTIF sees the payload.
  if([5,8,32946].includes(compression)) {
    const parts:Uint8Array[]=[],next:number[]=[],lengths:number[]=[];let total=bytes.length;
    for(let i=0;i<offsets.length;i++) {
      const at=offsets[i]!,n=counts[i]!,size=sizes[i]!;let data:Uint8Array;
      if(compression===5)data=inflateTiffLzw(bytes.subarray(at,at+n),size);
      else {
        const reader=new Blob([bytes.slice(at,at+n)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
        data=new Uint8Array(size);let length=0;
        try {for(;;){const {done,value}=await reader.read();if(done)break;ensure(length+value.length<=size,'TIFF inflated strip exceeds memory limit');data.set(value,length);length+=value.length;}ensure(length===size,'Truncated TIFF Deflate strip');}
        finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      }
      next.push(total);lengths.push(data.length);total+=data.length;parts.push(data);
    }
    const expanded=new Uint8Array(total);expanded.set(bytes);let p=bytes.length;for(const part of parts){expanded.set(part,p);p+=part.length;}buffer=expanded.buffer;
    page[tiled?'t324':'t273']=next;page[tiled?'t325':'t279']=lengths;page.t259=[1];
  }
  (UTIF.decodeImage as (b:ArrayBuffer,p:typeof page,pages:typeof ifds)=>void)(buffer,page,ifds);validateRaster({width:page.width!,height:page.height!},limit);
  const rgba=UTIF.toRGBA8(page);
  if([0,1].includes(root.get(262)?.[0]??0)&&samples===2&&(bits===8||bits===16)) {
    ensure(page.data,'Missing TIFF samples');
    for(let i=0;i<page.width!*page.height!;i++) {
      const at=i*2*(bits/8),grey=page.data[at+(bits===16?1:0)]!,alpha=page.data[at+(bits===16?3:1)]!;
      rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=root.get(262)?.[0]===0?255-grey:grey;rgba[i*4+3]=alpha;
    }
  }
  ensure(rgba.length===page.width!*page.height!*4,'Invalid TIFF pixels');
  // UTIF returns associated alpha unchanged for RGB TIFFs. The engine edge expects straight RGBA.
  if(root.get(338)?.[0]===1)for(let i=0;i<rgba.length;i+=4){const a=rgba[i+3]!;if(a>0&&a<255)for(let c=0;c<3;c++)rgba[i+c]=Math.min(255,Math.round(rgba[i+c]!*255/a));}
  const profile=root.get(34675);const icc=profile instanceof Uint8Array?describeIcc(profile):null;
  return {width:page.width!,height:page.height!,rgba,icc,orientation:tiffOrientation([root]),importInfo:{kind:'tiff',pageCount:countPages(bytes)}};
}

function countPages(bytes:Uint8Array) {
  const le=bytes[0]===73,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=view.getUint32(4,le),count=0;
  // All directory links and cycles have already been checked by tiffDirectories.
  while(at){count++;at=view.getUint32(at+2+u16(bytes,at,le)*12,le);}return count;
}
