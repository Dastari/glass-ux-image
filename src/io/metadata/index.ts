import { ascii, bounded, concat, ensure, FileDataError, MAX_METADATA_BYTES, range, u16, u32, utf8 } from '../formats/bytes.js';
import { assemble, chunk, chunks, type Chunk, type RasterFormat } from '../formats/container.js';
import { sniffFormat } from '../formats/index.js';
import { editXmp } from './xmp.js';
import { editExif, readExif, type ExifFields } from './tiff.js';
export { readExif, editExif, orientationTransform } from './tiff.js';
export type { ExifFields } from './tiff.js';
/** An original metadata payload, with container wrapping removed where possible. */
export interface MetadataPacket {
  /** Metadata family. */
  kind:'exif'|'xmp'|'iptc';
  /** Original bytes, including the Photoshop wrapper for JPEG IPTC. */
  data:Uint8Array;
  /** Original PNG text chunk type, for lossless same-format IPTC preservation. */
  containerType?:string;
}
/** Original metadata and a common-field view, with no DOM dependency. */
export interface ImageMetadata {
  /** Container in which the packets were read. */
  format:RasterFormat;
  /** Original packet bytes in file order. */
  packets:MetadataPacket[];
  /** Common EXIF fields; unknown tags remain preserved in packets. */
  fields:ExifFields;
  /** Whether each supported metadata family exists. */
  presence:{exif:boolean;xmp:boolean;iptc:boolean};
}
const EXIF=utf8('Exif\0\0'); const XMP=utf8('http://ns.adobe.com/xap/1.0/\0');
const starts=(b:Uint8Array,p:Uint8Array)=>p.every((v,i)=>b[i]===v);
function identify(c: Chunk, format: RasterFormat): MetadataPacket | undefined {
  if(format==='jpeg') {
    if(c.type==='e1'&&starts(c.data,EXIF)) return {kind:'exif',data:c.data.slice(6)};
    if(c.type==='e1'&&starts(c.data,XMP)) return {kind:'xmp',data:c.data.slice(XMP.length)};
    if(c.type==='ed'&&ascii(c.data.subarray(0,14))==='Photoshop 3.0\0') {
      let p=14, found=false;
      while(p<c.data.length) {
        range(c.data,p,7); ensure(ascii(c.data.subarray(p,p+4))==='8BIM','Invalid Photoshop resource');
        const id=u16(c.data,p+4),nameBytes=c.data[p+6]!+1; p+=6+nameBytes+(nameBytes%2);
        const size=u32(c.data,p); p+=4; range(c.data,p,size+(size%2)); p+=size+(size%2);
        if(id===0x0404) found=true;
      }
      if(found) return {kind:'iptc',data:c.data.slice()};
    }
    // Extended XMP is preserved as opaque metadata only within its source container.
    if(c.type==='e1'&&ascii(c.data.subarray(0,35)).startsWith('http://ns.adobe.com/xmp/extension/')) return {kind:'xmp',data:c.data.slice()};
  } else if(format==='png') {
    if(c.type==='eXIf') return {kind:'exif',data:c.data.slice()};
    if(['iTXt','tEXt','zTXt'].includes(c.type)) {
      const zero=c.data.indexOf(0); ensure(zero>=1&&zero<=79,'Invalid PNG text keyword'); const key=ascii(c.data.subarray(0,zero));
      if(key==='XML:com.adobe.xmp') {
        ensure(c.type==='iTXt','Unsupported XMP text encoding'); let p=zero+1; ensure(c.data[p++]===0 && c.data[p++]===0,'Compressed XMP is unsupported');
        for(let i=0;i<2;i++) { const end=c.data.indexOf(0,p); ensure(end>=p); p=end+1; }
        return {kind:'xmp',data:c.data.slice(p)};
      }
      if(/raw profile type (?:iptc|8bim)/i.test(key)) return {kind:'iptc',data:c.data.slice(),containerType:c.type};
    }
  } else {
    if(c.type==='EXIF') return {kind:'exif',data:starts(c.data,EXIF)?c.data.slice(6):c.data.slice()};
    if(c.type==='XMP ') return {kind:'xmp',data:c.data.slice()};
  }
}
/** Read bounded EXIF, XMP and IPTC packets and common fields from JPEG, PNG or WebP bytes. */
export function readMetadata(bytes: Uint8Array): ImageMetadata {
  const format=sniffFormat(bytes); ensure(format==='jpeg'||format==='png'||format==='webp','Metadata requires JPEG, PNG or WebP');
  const packets=chunks(bytes,format).flatMap(c=> { const p=identify(c,format); return p?[p]:[]; });
  bounded(concat(packets.map(p=>p.data)),MAX_METADATA_BYTES);
  const exif=packets.find(p=>p.kind==='exif');
  return {format,packets,fields:exif?readExif(exif.data):{},presence:{exif:packets.some(p=>p.kind==='exif'),xmp:packets.some(p=>p.kind==='xmp'),iptc:packets.some(p=>p.kind==='iptc')}};
}
export interface MetadataWriteOptions {
  /** Preserve original packets, remove all metadata, or remove standard GPS properties. */
  mode: 'preserve'|'strip'|'strip-gps';
  /** Set once decoding has honoured orientation or geometry has physically turned the pixels. */
  pixelsOriented?: boolean;
}
/**
 * Replaces metadata in encoded pixels. GPS-only removes standard EXIF/XMP GPS properties;
 * free text (including IPTC city/caption), camera fields and ICC are retained. This is not
 * general location anonymisation. Full strip removes recognised metadata and opaque text/APP tags.
 * ICC is managed separately for preservation; full strip also removes embedded profiles.
 */
export function writeMetadata(encoded: Uint8Array, original: ImageMetadata, options: MetadataWriteOptions): Uint8Array {
  const format=sniffFormat(encoded); ensure(format==='jpeg'||format==='png'||format==='webp');
  const parts=chunks(encoded,format); const packetParts: Uint8Array[]=[];
  if(options.mode!=='strip') for(const packet of original.packets) {
    let data=packet.data;
    if(packet.kind==='exif') data=editExif(data,{stripGps:options.mode==='strip-gps',normaliseOrientation:options.pixelsOriented});
    if(packet.kind==='xmp'&&(options.pixelsOriented||options.mode==='strip-gps')) data=editXmp(data,{stripGps:options.mode==='strip-gps',normaliseOrientation:options.pixelsOriented});
    if(format==='jpeg') {
      if(packet.kind==='iptc') { ensure(original.format==='jpeg','Cross-format IPTC conversion is unsupported'); packetParts.push(chunk('ed',data,format)); }
      else packetParts.push(chunk('e1',packet.kind==='exif'?concat([EXIF,data]):ascii(data.subarray(0,35)).startsWith('http://ns.adobe.com/xmp/extension/')?data:concat([XMP,data]),format));
    } else if(format==='png') {
      if(packet.kind==='iptc') { ensure(original.format==='png','Cross-format IPTC conversion is unsupported'); packetParts.push(chunk(packet.containerType??'iTXt',data,format)); }
      else packetParts.push(chunk(packet.kind==='exif'?'eXIf':'iTXt',packet.kind==='exif'?data:concat([utf8('XML:com.adobe.xmp\0\0\0\0\0'),data]),format));
    } else { if(packet.kind==='iptc') throw new FileDataError('unsupported','WebP has no IPTC chunk'); packetParts.push(chunk(packet.kind==='exif'?'EXIF':'XMP ',data,format)); }
  }
  const clean=parts.filter(c=> {
    if(identify(c,format)) return false;
    if(options.mode!=='strip') return true;
    if(format==='png') return !['tEXt','zTXt','iTXt','eXIf','iCCP'].includes(c.type);
    if(format==='jpeg') return !(c.type==='fe'||/^e[1-9a-f]$/.test(c.type));
    return !['EXIF','XMP ','ICCP'].includes(c.type);
  });
  if(format==='webp') return assembleWebp(encoded,clean,packetParts);
  const at=format==='png'?1:0;
  return assemble(encoded,[...clean.slice(0,at).map(c=>c.raw),...packetParts,...clean.slice(at).map(c=>c.raw)],format);
}
/** WebP metadata requires VP8X feature flags, even when the encoded source was simple VP8/VP8L. */
export function assembleWebp(original: Uint8Array, clean: Chunk[], added: Uint8Array[]) {
  const all=[...clean.map(c=>({type:c.type,data:c.data.slice(),raw:c.raw})),...added.map(raw=>({type:ascii(raw.subarray(0,4)),data:raw.subarray(8,8+new DataView(raw.buffer,raw.byteOffset).getUint32(4,true)),raw}))];
  let extended=all.find(c=>c.type==='VP8X');
  if(!extended && added.length) {
    const vp8=all.find(c=>c.type==='VP8 '),lossless=all.find(c=>c.type==='VP8L'); let w:number,h:number,alpha=false;
    if(vp8) { ensure(vp8.data.length>=10 && ascii(vp8.data.subarray(3,6))==='\x9d\x01\x2a'); const v=new DataView(vp8.data.buffer,vp8.data.byteOffset); w=v.getUint16(6,true)&16383; h=v.getUint16(8,true)&16383; }
    else { ensure(lossless && lossless.data.length>=5 && lossless.data[0]===0x2f); const bits=new DataView(lossless.data.buffer,lossless.data.byteOffset).getUint32(1,true); w=(bits&16383)+1; h=((bits>>>14)&16383)+1; alpha=!!(bits&0x10000000); }
    ensure(w>0&&h>0); const d=new Uint8Array(10); d[0]=alpha?16:0; for(let i=0;i<3;i++) { d[4+i]=((w-1) >>> (8*i))&255; d[7+i]=((h-1) >>> (8*i))&255; }
    extended={type:'VP8X',data:d,raw:chunk('VP8X',d,'webp')}; all.unshift(extended);
  }
  if(extended) { ensure(extended.data.length===10); extended.data[0]=(extended.data[0]!&~0x2c)|(all.some(c=>c.type==='ICCP')?32:0)|(all.some(c=>c.type==='EXIF')?8:0)|(all.some(c=>c.type==='XMP ')?4:0); extended.raw=chunk('VP8X',extended.data,'webp'); }
  // ICC belongs before image data; EXIF/XMP follow it.
  const ordered=[...all.filter(c=>c.type==='VP8X'),...all.filter(c=>c.type==='ICCP'),...all.filter(c=>c.type!=='VP8X'&&c.type!=='ICCP')];
  return assemble(original,ordered.map(c=>c.raw),'webp');
}
