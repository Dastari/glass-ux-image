import { ascii, bounded, ensure, MAX_METADATA_BYTES, range, u16, u32 } from './bytes.js';
// TIFF 6.0 structural fields. A byte view of a signed/float value must never become geometry.
const shorts=new Set([258,259,262,266,274,277,284,317,338,339,530,531]);
const dimensions=new Set([256,257,273,278,279,322,323,324,325]);
const pointers=new Set([330,34665,34853,61440]);
const scalar=new Set([256,257,259,262,266,274,277,278,284,317,322,323,531]);
/** Bounded classic TIFF/ORF IFD reader, shared with the embedded-preview importer.
 * Aliased payloads are charged on every reference, across every directory, before materialisation. */
export function tiffDirectories(bytes:Uint8Array) {
  bounded(bytes);const endian=ascii(bytes.subarray(0,2));ensure(endian==='II'||endian==='MM','Invalid TIFF byte order');const le=endian==='II';
  ensure([42,0x4f52,0x5352].includes(u16(bytes,2,le)),'Unsupported TIFF header');
  const queue=[u32(bytes,4,le)],seen=new Set<number>(),directories:Map<number,number[]|Uint8Array>[]=[];
  const units=[0,1,1,2,4,8,1,1,2,4,8,4,8,4];let total=0,values=0,allocation=0;
  while(queue.length) {
    const at=queue.shift()!;if(!at)continue;ensure(!seen.has(at)&&seen.size<128,'Cyclic or excessive TIFF directories');seen.add(at);
    const n=u16(bytes,at,le);ensure(n<=4096&&(total+=n)<=16384,'Too many TIFF tags');range(bytes,at,2+n*12+4);
    const tags=new Map<number,number[]|Uint8Array>();directories.push(tags);
    for(let i=0;i<n;i++) {
      const p=at+2+i*12,tag=u16(bytes,p,le),type=u16(bytes,p+2,le),count=u32(bytes,p+4,le),unit=units[type];
      ensure(unit,'Unsupported TIFF tag type');ensure(!tags.has(tag),'Duplicate TIFF tag');
      if(shorts.has(tag)||tag===320)ensure(type===3,'Invalid TIFF structural tag type');
      if(dimensions.has(tag))ensure(type===3||type===4,'Invalid TIFF structural tag type');
      if(pointers.has(tag))ensure(type===4||type===13,'Invalid TIFF directory pointer type');
      if([513,514].includes(tag))ensure(type===4&&count===1,'Invalid TIFF JPEG pointer');
      if(scalar.has(tag))ensure(count===1,'Invalid TIFF structural tag count');
      if(shorts.has(tag)||dimensions.has(tag)||pointers.has(tag)||tag===320)ensure(count>0,'Empty TIFF structural tag');
      const length=count*unit,offset=length<=4?p+8:u32(bytes,p+8,le);range(bytes,offset,length);
      // UTIF-style rationals create an outer slot, an array and two numeric slots per value.
      // Byte/ASCII fields instead cost views/strings; do not reject ordinary large ICC profiles.
      const numeric=type!==1&&type!==2&&type!==6&&type!==7,rational=type===5||type===10;
      values+=numeric?count*(rational?4:1):0;
      allocation+=64+(numeric?count*(rational?64:8):length*2);
      ensure(values<=65536&&allocation<=MAX_METADATA_BYTES,'TIFF decoded values exceed allocation budget');
      if(type===3||type===4||type===13) {
        const entries=Array.from({length:count},(_,j)=>type===3?u16(bytes,offset+j*2,le):u32(bytes,offset+j*4,le));tags.set(tag,entries);
        if(pointers.has(tag)) {ensure(queue.length+entries.length<=128,'Too many TIFF directory pointers');queue.push(...entries);}
      } else tags.set(tag,bytes.subarray(offset,offset+length));
    }
    queue.push(u32(bytes,at+2+n*12,le));
  }
  return directories;
}
export function rawTiff(directories:ReturnType<typeof tiffDirectories>) {
  return directories.some(d=>d.has(50706)||d.has(33421)||d.has(33422)||d.get(262)?.[0]===32803||d.get(259)?.[0]===34713);
}
export function tiffOrientation(directories:ReturnType<typeof tiffDirectories>) {
  const value=directories.find(d=>d.has(274))?.get(274)?.[0];
  if(value!==undefined)ensure(value>=1&&value<=8,'Invalid TIFF orientation');return value;
}
