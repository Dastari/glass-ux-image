import { ascii, bounded, ensure, MAX_METADATA_BYTES, range, u16, u32, view } from '../formats/bytes.js';
export interface ExifFields {
  /** Camera manufacturer. */
  cameraMake?:string;
  /** Camera model. */
  cameraModel?:string;
  /** Lens model. */
  lens?:string;
  /** Exposure duration in seconds. */
  exposureSeconds?:number;
  /** Aperture f-number. */
  aperture?:number;
  /** ISO photographic sensitivity. */
  iso?:number;
  /** Focal length in millimetres. */
  focalLengthMm?:number;
  /** Original capture date, falling back to the TIFF modification date. */
  date?:string;
  /** Original EXIF orientation, one to eight. Decode honours it exactly once. */
  orientation?:number;
  /** GPS coordinates in signed degrees and altitude in metres. */
  gps?:{latitude?:number;longitude?:number;altitude?:number};
}
/** Which directory an entry lives in. Later chained IFDs past the thumbnail read as `ifd1`. */
export type ExifIfd = 'ifd0'|'ifd1'|'exif'|'gps'|'interop';
/** One directory entry, with absolute offsets into the TIFF payload. */
export interface Entry { tag: number; type: number; count: number; at: number; data: number; size: number; gps: boolean; ifd: ExifIfd }
/** Classic TIFF only; offsets are relative to this TIFF header. Bounded graph traversal rejects cycles. */
export function walk(bytes: Uint8Array, limit=MAX_METADATA_BYTES) {
  bounded(bytes,limit); const endian=ascii(bytes.subarray(0,2)); ensure(endian==='II'||endian==='MM'); const le=endian==='II';
  ensure(u16(bytes,2,le)===42); const entries: Entry[]=[]; const visited=new Set<number>();
  const queue:{offset:number;gps:boolean;ifd:ExifIfd}[]=[{offset:u32(bytes,4,le),gps:false,ifd:'ifd0'}]; const sizes=[0,1,1,2,4,8,1,1,2,4,8,4,8];
  const directories: {offset:number; size:number; gps:boolean; ifd:ExifIfd}[]=[];
  while(queue.length) {
    const {offset,gps,ifd}=queue.shift()!; if(!offset) continue;
    ensure(!visited.has(offset)&&visited.size<64,'Cyclic or excessive EXIF directories'); visited.add(offset);
    const count=u16(bytes,offset,le); ensure(count<=4096 && entries.length+count<=8192,'Too many EXIF entries');
    range(bytes,offset,2+count*12+4); directories.push({offset,size:2+count*12+4,gps,ifd});
    for(let i=0;i<count;i++) {
      const at=offset+2+i*12, tag=u16(bytes,at,le), type=u16(bytes,at+2,le), n=u32(bytes,at+4,le);
      const unit=sizes[type]; ensure(unit!==undefined&&unit>0,'Unsupported EXIF field type');
      const size=n*unit; const data=size<=4?at+8:u32(bytes,at+8,le); range(bytes,data,size);
      entries.push({tag,type,count:n,at,data,size,gps,ifd});
      if(tag===0x8769||tag===0x8825||tag===0xa005) { ensure(type===4&&n===1); queue.push({offset:u32(bytes,data,le),gps:gps||tag===0x8825,ifd:tag===0x8769?'exif':tag===0x8825?'gps':'interop'}); }
    }
    // Only the main chain continues to a thumbnail; sub-IFDs have no meaningful successor.
    queue.push({offset:u32(bytes,offset+2+count*12,le),gps,ifd:ifd==='ifd0'||ifd==='ifd1'?'ifd1':ifd});
  }
  return {entries,directories,le};
}
/** Read supported EXIF fields from a bounded TIFF payload; unknown tags remain in the original packet. */
export function readExif(bytes: Uint8Array): ExifFields {
  const {entries,le}=walk(bytes); const fields: ExifFields={};
  const text=(e:Entry)=>ascii(bytes.subarray(e.data,e.data+Math.min(e.size,4096))).replace(/\0.*$/s,'').trim();
  const number=(e:Entry,i=0) => {
    ensure(i<e.count);
    if(e.type===3) return u16(bytes,e.data+i*2,le);
    if(e.type===4) return u32(bytes,e.data+i*4,le);
    if(e.type===1) return bytes[e.data+i]!;
    if(e.type===5||e.type===10) { const v=view(bytes,e.data+i*8,8); const a=e.type===5?v.getUint32(0,le):v.getInt32(0,le); const b=e.type===5?v.getUint32(4,le):v.getInt32(4,le); ensure(b!==0,'Zero EXIF denominator'); return a/b; }
    return undefined;
  };
  const find=(tag:number,gps=false)=>entries.find(e=>e.tag===tag&&e.gps===gps);
  const strings: [number,keyof ExifFields][]=[[0x10f,'cameraMake'],[0x110,'cameraModel'],[0xa434,'lens'],[0x9003,'date']];
  for(const [tag,key] of strings) { const e=find(tag); if(e?.type===2) Object.assign(fields,{[key]:text(e)}); }
  const numbers: [number,keyof ExifFields][]=[[0x112,'orientation'],[0x829a,'exposureSeconds'],[0x829d,'aperture'],[0x8827,'iso'],[0x920a,'focalLengthMm']];
  for(const [tag,key] of numbers) { const e=find(tag); if(e?.count) Object.assign(fields,{[key]:number(e)}); }
  if(!fields.date) { const date=find(0x132); if(date?.type===2) fields.date=text(date); }
  if(fields.orientation!==undefined) ensure(Number.isInteger(fields.orientation)&&fields.orientation>=1&&fields.orientation<=8,'Invalid EXIF orientation');
  const lat=find(2,true),lon=find(4,true),alt=find(6,true);
  if(lat||lon||alt) {
    fields.gps={};
    for(const [e,key,refTag,negative] of [[lat,'latitude',1,'S'],[lon,'longitude',3,'W']] as const) {
      if(e) { ensure(e.count===3 && e.type===5); const ref=find(refTag,true); const sign=ref&&text(ref)===negative?-1:1; fields.gps[key]=sign*(number(e,0)!+number(e,1)!/60+number(e,2)!/3600); }
    }
    if(alt?.count) { const ref=find(5,true); fields.gps.altitude=number(alt)!*(ref&&number(ref)===1?-1:1); }
  }
  return fields;
}
/** GPS stripping removes directory entries and zeroes their referenced bytes, not just the pointer. */
export function editExif(bytes: Uint8Array, options: { stripGps?: boolean; normaliseOrientation?: boolean }) {
  const {entries,directories,le}=walk(bytes); const out=bytes.slice();
  if(options.stripGps) {
    // Never overwrite a shared value used by a non-GPS entry: reject ambiguous hostile TIFFs.
    const gpsRanges=entries.filter(e=>e.gps).map(e=>({offset:e.data,size:e.size})).concat(directories.filter(d=>d.gps));
    for(const r of gpsRanges) {
      ensure(!entries.some(e=>!e.gps && e.tag!==0x8825 && e.size>4 && e.data<r.offset+r.size && r.offset<e.data+e.size),'Overlapping GPS metadata');
      out.fill(0,r.offset,r.offset+r.size);
    }
    for(const d of directories.filter(d=>!d.gps)) {
      const kept=entries.filter(e=>e.at>=d.offset+2&&e.at<d.offset+d.size-4&&e.tag!==0x8825);
      const next=bytes.slice(d.offset+d.size-4,d.offset+d.size);
      out.fill(0,d.offset,d.offset+d.size); new DataView(out.buffer).setUint16(d.offset,kept.length,le);
      kept.forEach((e,i)=>out.set(bytes.subarray(e.at,e.at+12),d.offset+2+i*12)); out.set(next,d.offset+2+kept.length*12);
    }
  }
  if(options.normaliseOrientation) {
    // GPS compaction may have moved entries, so walk the rewritten directory table.
    for(const e of walk(out).entries.filter(e=>e.tag===0x112)) {
      ensure(e.type===3&&e.count===1,'Invalid orientation field'); new DataView(out.buffer).setUint16(e.data,1,le);
    }
  }
  return out;
}
/** Source-to-upright affine transform; output dimensions swap for orientations 5–8. */
export function orientationTransform(orientation: number, width: number, height: number) {
  ensure(Number.isInteger(orientation)&&orientation>=1&&orientation<=8);
  const matrices: number[][]=[[1,0,0,1,0,0],[-1,0,0,1,width,0],[-1,0,0,-1,width,height],[1,0,0,-1,0,height],[0,1,1,0,0,0],[0,1,-1,0,height,0],[0,-1,-1,0,height,width],[0,-1,1,0,0,width]];
  return {matrix:matrices[orientation-1]!,width:orientation>=5?height:width,height:orientation>=5?width:height};
}

/** Read TIFF X/YResolution as DPI, respecting ResolutionUnit (inches or centimetres). */
export function readExifDpi(bytes:Uint8Array):{x:number;y:number}|null {
  const {entries,le}=walk(bytes),root=u32(bytes,4,le),count=root?u16(bytes,root,le):0;
  const rootEntry=(tag:number)=>entries.find(e=>e.tag===tag&&e.at>=root+2&&e.at<root+2+count*12);
  const x=rootEntry(0x11a),y=rootEntry(0x11b),unit=rootEntry(0x128);
  if(!x||!y)return null;ensure(x.type===5&&x.count===1&&y.type===5&&y.count===1);
  if(unit)ensure(unit.type===3&&unit.count===1);const units=unit?u16(bytes,unit.data,le):2;if(units!==2&&units!==3)return null;
  const rational=(at:number)=>{const denominator=u32(bytes,at+4,le);ensure(denominator>0);return u32(bytes,at,le)/denominator;};
  const scale=units===2?1:2.54;return {x:rational(x.data)*scale,y:rational(y.data)*scale};
}
/** Append a replacement root IFD so unknown fields, nested IFDs and their offsets stay intact. */
export function writeExifDpi(bytes:Uint8Array,dpi:number):Uint8Array {
  ensure(Number.isFinite(dpi)&&dpi>=1&&dpi<=65535,'Invalid EXIF DPI');const {le}=walk(bytes),root=u32(bytes,4,le),count=root?u16(bytes,root,le):0;
  const fields:{tag:number;raw:Uint8Array}[]=[];
  for(let i=0;i<count;i++) {const at=root+2+i*12,tag=u16(bytes,at,le);if(![0x11a,0x11b,0x128].includes(tag))fields.push({tag,raw:bytes.slice(at,at+12)});}
  const next=root?u32(bytes,root+2+count*12,le):0,offset=bytes.length+(bytes.length%2),total=fields.length+3;ensure(total<=4096);
  const rationalAt=offset+2+total*12+4;const out=new Uint8Array(rationalAt+16);bounded(out,MAX_METADATA_BYTES);out.set(bytes);const v=new DataView(out.buffer);v.setUint32(4,offset,le);v.setUint16(offset,total,le);
  for(const [tag,type,value] of [[0x11a,5,rationalAt],[0x11b,5,rationalAt+8],[0x128,3,2]]) {const raw=new Uint8Array(12),entry=new DataView(raw.buffer);entry.setUint16(0,tag!,le);entry.setUint16(2,type!,le);entry.setUint32(4,1,le);if(type===3)entry.setUint16(8,value!,le);else entry.setUint32(8,value!,le);fields.push({tag:tag!,raw});}
  fields.sort((a,b)=>a.tag-b.tag);fields.forEach((field,i)=>out.set(field.raw,offset+2+i*12));v.setUint32(offset+2+total*12,next,le);
  for(const at of [rationalAt,rationalAt+8]) {v.setUint32(at,Math.round(dpi*10000),le);v.setUint32(at+4,10000,le);}return out;
}
