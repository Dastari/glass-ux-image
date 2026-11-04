import { ascii, bounded, ensure, range, u16, u32 } from '../io/formats/bytes.js';
import { checkRawScan } from '../io/formats/raw-preflight.js';
import { imageDimensions } from '../io/formats/dimensions.js';
import { tiffDirectories, tiffOrientation } from '../io/formats/tiff-directory.js';
import { readMetadata, writeMetadata } from '../io/metadata/index.js';
/** Find a complete JPEG, stepping over marker payloads and byte-stuffed entropy data. */
function jpegEnd(bytes:Uint8Array,start:number) {
  let p=start+2,scan=false;
  while(p<bytes.length) {
    if(scan) {while(p<bytes.length&&bytes[p]!==255)p++;if(p>=bytes.length)return;}
    if(bytes[p++]!==255)return;while(bytes[p]===255)p++;const marker=bytes[p++];
    if(marker===0&&scan)continue;if(marker===0xd9)return p;
    if(marker===undefined||marker===0xd8)return;
    if(marker>=0xd0&&marker<=0xd7)continue;
    if(marker===1)continue;
    if(p+2>bytes.length)return;const n=u16(bytes,p);if(n<2||p+n>bytes.length)return;
    p+=n;scan=marker===0xda;
  }
}
/** Largest complete embedded JPEG by pixel area (then byte length), never raw sensor decoding. */
export function extractRawPreview(input:Uint8Array,maxPixels=64*1024*1024) {
  checkRawScan(input);
  const bytes=bounded(input),jpegRanges:[number,number][]=[];let best:Uint8Array|undefined,area=0,orientation:number|undefined;
  const prefix=ascii(bytes.subarray(0,2));
  if(prefix==='II'||prefix==='MM')orientation=tiffOrientation(tiffDirectories(bytes));
  for(let p=0;p<bytes.length-3;p++) {
    if(bytes[p]!==255||bytes[p+1]!==0xd8||bytes[p+2]!==255)continue;
    const end=jpegEnd(bytes,p);if(!end)continue;
    jpegRanges.push([p,end]);const jpeg=bytes.subarray(p,end);try {
      const size=imageDimensions(jpeg)!;const pixels=size.width*size.height;
      // Validate every candidate, but do not choose a smaller preview when the largest exceeds policy.
      if(pixels>area||(pixels===area&&jpeg.length>(best?.length??0))) {best=jpeg;area=pixels;}
    } catch { /* A signature inside opaque camera data is not necessarily a JPEG. */ }
    p=end-1;
  }
  ensure(best,'No embedded JPEG preview in this RAW file');ensure(area<=maxPixels,'RAW preview exceeds pixel limit');
  // Canon CR3 CMT1 contains a classic TIFF metadata header, rather than JPEG EXIF wrapping.
  if(orientation===undefined)for(let p=4;p<bytes.length-12;p++) {
    if(bytes[p]!==67||ascii(bytes.subarray(p,p+4))!=='CMT1')continue;
    try {const n=u32(bytes,p-4);range(bytes,p-4,n);orientation=tiffOrientation(tiffDirectories(bytes.subarray(p+4,p-4+n)));if(orientation!==undefined)break;}catch { /* Ignore unrelated byte patterns. */ }
  }
  // CR3 may carry an Exif TIFF inside a UUID box. RAF normally keeps it in its JPEG.
  if(orientation===undefined)for(let p=0;p<bytes.length-14;p++) {
    if(bytes[p]!==69||bytes[p+1]!==120||ascii(bytes.subarray(p,p+6))!=='Exif\0\0')continue;
    if(jpegRanges.some(([start,end])=>p>=start&&p<end))continue;
    try {orientation=tiffOrientation(tiffDirectories(bytes.subarray(p+6)));if(orientation!==undefined)break;}catch { /* Ignore unrelated byte patterns. */ }
  }
  const metadata=readMetadata(best);orientation??=metadata.fields.orientation??1;
  // A container orientation wins over a thumbnail's absent/stale orientation. Add a tiny EXIF
  // packet if needed, so the native decoder handles all eight rotations/reflections exactly once.
  const exif=new Uint8Array(26),v=new DataView(exif.buffer);exif.set([73,73,42,0,8,0,0,0]);v.setUint16(8,1,true);v.setUint16(10,274,true);v.setUint16(12,3,true);v.setUint32(14,1,true);v.setUint16(18,orientation,true);
  const original=metadata.packets.find(p=>p.kind==='exif');
  let corrected=exif;
  if(original) {
    // Append a new root directory, retaining unknown tags and their original relative offsets.
    const b=original.data,le=ascii(b.subarray(0,2))==='II',root=u32(b,4,le),count=u16(b,root,le),fields:Uint8Array[]=[];
    for(let i=0;i<count;i++){const p=root+2+i*12;if(u16(b,p,le)!==274)fields.push(b.slice(p,p+12));}
    const at=b.length+(b.length%2),out=new Uint8Array(at+2+(fields.length+1)*12+4),view=new DataView(out.buffer);out.set(b);view.setUint32(4,at,le);view.setUint16(at,fields.length+1,le);
    fields.forEach((field,i)=>out.set(field,at+2+i*12));const p=at+2+fields.length*12;view.setUint16(p,274,le);view.setUint16(p+2,3,le);view.setUint32(p+4,1,le);view.setUint16(p+8,orientation,le);view.setUint32(p+12,u32(b,root+2+count*12,le),le);corrected=out;
  }
  const packets=metadata.packets.filter(p=>p.kind!=='exif');packets.push({kind:'exif',data:corrected});
  // Preserve the preview's original EXIF packet when it already has the correct orientation.
  if(metadata.fields.orientation===orientation)return {jpeg:best.slice(),orientation};
  const jpeg=writeMetadata(best,{...metadata,packets},{mode:'preserve'});
  range(jpeg,0,jpeg.length);return {jpeg,orientation};
}
