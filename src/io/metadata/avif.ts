import { ascii, bounded, concat, ensure, MAX_METADATA_BYTES, range, u16, u32, utf8 } from '../formats/bytes.js';
import type { ImageMetadata, MetadataPacket, MetadataWriteOptions } from './index.js';
import { editExif, readExif } from './tiff.js';
import { editXmp } from './xmp.js';

interface Box {type:string;data:Uint8Array;raw:Uint8Array;start:number;end:number}
const word=(n:number)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n);return b;};
const short=(n:number)=>{ensure(n>=0&&n<=65535);return new Uint8Array([n>>>8,n&255]);};
const box=(type:string,...parts:Uint8Array[])=>{const data=concat(parts);return concat([word(data.length+8),utf8(type),data]);};
function boxes(bytes:Uint8Array,start=0,end=bytes.length):Box[] {
  const result:Box[]=[];
  for(let at=start;at<end;) {range(bytes,at,8);let size=u32(bytes,at),header=8;if(size===1){range(bytes,at,16);ensure(u32(bytes,at+8)===0,'AVIF box exceeds supported size');size=u32(bytes,at+12);header=16;}else if(!size)size=end-at;ensure(size>=header&&at+size<=end&&result.length<65536,'Invalid AVIF box');result.push({type:ascii(bytes.subarray(at+4,at+8)),data:bytes.subarray(at+header,at+size),raw:bytes.subarray(at,at+size),start:at,end:at+size});at+=size;}
  return result;
}
interface Location {id:number;method:number;extents:{offset:number;length:number}[]}
function locations(data:Uint8Array):Location[] {
  range(data,0,8);const version=data[0]!;ensure(version<=2);const offsetSize=data[4]!>>>4,lengthSize=data[4]!&15,baseSize=data[5]!>>>4,indexSize=version?data[5]!&15:0;
  let at=6;const integer=(size:number)=>{ensure([0,1,2,4,8].includes(size));range(data,at,size);let value=0;for(let i=0;i<size;i++)value=value*256+data[at++]!;ensure(Number.isSafeInteger(value));return value;};
  const count=integer(version<2?2:4);ensure(count<=65535);const out:Location[]=[];
  for(let i=0;i<count;i++) {
    const id=integer(version<2?2:4),method=version?integer(2)&15:0,reference=integer(2);ensure(id<=65535&&method<=1&&reference===0,'Unsupported AVIF item location');
    const base=integer(baseSize),n=integer(2);ensure(n<=65535);const extents=[];
    for(let j=0;j<n;j++){if(indexSize)ensure(integer(indexSize)===0,'Indexed AVIF extent is unsupported');extents.push({offset:base+integer(offsetSize),length:integer(lengthSize)});}
    out.push({id,method,extents});
  }
  ensure(at===data.length);return out;
}
function writeLocations(items:Location[]) {
  return box('iloc',new Uint8Array([1,0,0,0,0x44,0]),short(items.length),...items.map(item=>concat([short(item.id),short(item.method),short(0),short(item.extents.length),...item.extents.map(e=>concat([word(e.offset),word(e.length)]))])));
}
function primary(data:Uint8Array){range(data,0,6);return data[0]===0?u16(data,4):u32(data,4);}
function itemInfo(data:Uint8Array) {
  range(data,0,6);const children=boxes(data,data[0]===0?6:8);
  return children.map(entry=>{ensure(entry.type==='infe'&&entry.data[0]===2,'Unsupported AVIF item info');range(entry.data,0,12);return {id:u16(entry.data,4),type:ascii(entry.data.subarray(8,12)),box:entry};});
}
function parts(bytes:Uint8Array) {
  bounded(bytes);const top=boxes(bytes),meta=top.find(b=>b.type==='meta');ensure(meta&&meta.data[0]===0,'AVIF needs an ordinary meta box');
  const children=boxes(meta.data,4),find=(type:string)=>{const entry=children.find(b=>b.type===type);ensure(entry,`Missing AVIF ${type}`);return entry;};
  const loc=locations(find('iloc').data);
  for(const item of loc)for(const extent of item.extents)range(item.method===1?find('idat').data:bytes,extent.offset,extent.length);
  return {top,meta,children,find,id:primary(find('pitm').data),items:itemInfo(find('iinf').data),locations:loc};
}
/** Read the primary image's EXIF/XMP and ICC properties from a still AVIF container. */
export function readAvifMetadata(bytes:Uint8Array):{metadata:ImageMetadata;icc:Uint8Array|null} {
  const file=parts(bytes),packets:MetadataPacket[]=[];
  const refs=file.children.find(b=>b.type==='iref'),describes=new Set<number>();
  if(refs){ensure(refs.data[0]===0);for(const ref of boxes(refs.data,4))if(ref.type==='cdsc'){const n=u16(ref.data,2);range(ref.data,4,n*2);if(Array.from({length:n},(_,i)=>u16(ref.data,4+i*2)).includes(file.id))describes.add(u16(ref.data,0));}}
  for(const item of file.items) {
    if(!describes.has(item.id)||!['Exif','mime'].includes(item.type))continue;
    if(item.type==='mime'&&!ascii(item.box.data).includes('application/rdf+xml\0'))continue;
    const location=file.locations.find(l=>l.id===item.id);ensure(location);const source=location.method===1?file.find('idat').data:bytes;
    let total=0;const chunks=location.extents.map(e=>{range(source,e.offset,e.length);total+=e.length;ensure(total<=MAX_METADATA_BYTES);return source.subarray(e.offset,e.offset+e.length);});let data=concat(chunks);
    if(item.type==='Exif'){const start=4+u32(data,0);range(data,start,8);data=data.slice(start);}
    packets.push({kind:item.type==='Exif'?'exif':'xmp',data});
  }
  bounded(concat(packets.map(p=>p.data)),MAX_METADATA_BYTES);
  const properties=boxes(file.find('iprp').data),ipco=properties.find(b=>b.type==='ipco'),ipma=properties.find(b=>b.type==='ipma');let icc:Uint8Array|null=null;
  if(ipco&&ipma){const all=boxes(ipco.data),associations=readAssociations(ipma.data).find(a=>a.id===file.id);for(const index of associations?.indices??[]){const property=all[(index&32767)-1];if(property?.type==='colr'&&['prof','rICC'].includes(ascii(property.data.subarray(0,4))))icc=property.data.slice(4);}}
  const exif=packets.find(p=>p.kind==='exif');return {metadata:{format:'avif',packets,fields:exif?readExif(exif.data):{},presence:{exif:!!exif,xmp:packets.some(p=>p.kind==='xmp'),iptc:false}},icc};
}
interface Association {id:number;indices:number[]}
function readAssociations(data:Uint8Array):Association[] {
  range(data,0,8);ensure(data[0]!<=1);const wide=!!(data[3]!&1),count=u32(data,4);ensure(count<=65535);let at=8;const out:Association[]=[];
  for(let i=0;i<count;i++){const id=data[0]===0?u16(data,at):u32(data,at);at+=data[0]===0?2:4;range(data,at,1);const n=data[at++]!,indices=[];for(let j=0;j<n;j++){range(data,at,wide?2:1);const raw=wide?u16(data,at):data[at]!;indices.push(wide?raw:(raw&127)|((raw&128)?32768:0));at+=wide?2:1;}out.push({id,indices});}ensure(at===data.length);return out;
}
/**
 * Add EXIF/XMP items (cdsc → primary) and a primary-image ICC colr property. Rebuild iloc
 * offsets after meta grows; compressed AV1/alpha payloads and nclx YUV signalling stay intact.
 * Still-image encoder output only; tracks, external data and indexed extents are rejected.
 */
export function writeAvifMetadata(bytes:Uint8Array,original:ImageMetadata|undefined,options:MetadataWriteOptions,icc:Uint8Array|null):Uint8Array {
  const file=parts(bytes);ensure(!file.top.some(b=>b.type==='moov'),'AVIF sequences are unsupported');
  const existingMetadata=new Set(file.items.filter(i=>i.type==='Exif'||i.type==='mime').map(i=>i.id));
  // This writer consumes fresh encoder output, rather than silently retaining opaque metadata.
  ensure(!existingMetadata.size,'AVIF encoder output already contains metadata');
  const packets:MetadataPacket[]=[];
  if(options.mode!=='strip')for(const packet of original?.packets??[]) {
    if(packet.kind==='iptc')continue; // AVIF has no standard IPTC item; EXIF and XMP are portable.
    packets.push({...packet,data:packet.kind==='exif'?editExif(packet.data,{stripGps:options.mode==='strip-gps',normaliseOrientation:options.pixelsOriented}):editXmp(packet.data,{stripGps:options.mode==='strip-gps',normaliseOrientation:options.pixelsOriented})});
  }
  bounded(concat(packets.map(p=>p.data)),MAX_METADATA_BYTES);if(icc)bounded(icc,MAX_METADATA_BYTES);
  let next=Math.max(file.id,...file.items.map(i=>i.id))+1;
  const added=packets.map(packet=>{const id=next++;ensure(id<=65535);const type=packet.kind==='exif'?'Exif':'mime',payload=type==='Exif'?concat([word(0),packet.data]):packet.data;
    const info=box('infe',new Uint8Array([2,0,0,0]),short(id),short(0),utf8(type),utf8(packet.kind==='exif'?'Exif\0':'XMP\0application/rdf+xml\0\0'));
    return {id,payload,info,ref:box('cdsc',short(id),short(1),short(file.id))};});
  const iprp=file.find('iprp'),propertyBoxes=boxes(iprp.data),ipco=propertyBoxes.find(b=>b.type==='ipco'),ipma=propertyBoxes.find(b=>b.type==='ipma');ensure(ipco&&ipma);
  const properties=boxes(ipco.data),associations=readAssociations(ipma.data),target=associations.find(a=>a.id===file.id);ensure(target);
  target.indices=target.indices.filter(index=>{const p=properties[(index&32767)-1];return !(p?.type==='colr'&&['prof','rICC'].includes(ascii(p.data.subarray(0,4))));});
  if(icc){ensure(properties.length<32767);target.indices.push(properties.length+1);}
  const colour=icc?box('colr',utf8('prof'),icc):undefined;
  // Keep the encoder's nclx property: it specifies the actual AV1 YUV matrix/range. ICC has precedence for RGB colourimetry.
  const newIpco=box('ipco',...properties.map(p=>p.raw),...(colour?[colour]:[]));
  const newIpma=box('ipma',new Uint8Array([0,0,0,1]),word(associations.length),...associations.map(a=>{ensure(a.indices.length<=255);return concat([short(a.id),new Uint8Array([a.indices.length]),...a.indices.map(short)]);}));
  const newIprp=box('iprp',...propertyBoxes.map(b=>b.type==='ipco'?newIpco:b.type==='ipma'?newIpma:b.raw));
  const oldRefs=file.children.find(b=>b.type==='iref');if(oldRefs)ensure(oldRefs.data[0]===0);
  const newRefs=box('iref',word(0),...(oldRefs?boxes(oldRefs.data,4).map(b=>b.raw):[]),...added.map(a=>a.ref));
  const newInfo=box('iinf',word(0),short(file.items.length+added.length),...file.items.map(i=>i.box.raw),...added.map(a=>a.info));
  const payloads=added.map(a=>a.payload),extraLocations=added.map(a=>({id:a.id,method:0,extents:[{offset:0,length:a.payload.length}]}));
  const makeMeta=(loc:Location[])=>box('meta',word(0),...file.children.map(b=>b.type==='iloc'?writeLocations(loc):b.type==='iinf'?newInfo:b.type==='iprp'?newIprp:b.type==='iref'?newRefs:b.raw),...(!oldRefs&&added.length?[newRefs]:[]));
  const provisional=makeMeta([...file.locations,...extraLocations]),delta=provisional.length-file.meta.raw.length;
  const moved=file.locations.map(l=>({...l,extents:l.extents.map(e=>({...e,offset:l.method===0&&e.offset>=file.meta.end?e.offset+delta:e.offset}))}));
  let offset=bytes.length+delta+8;for(const loc of extraLocations){loc.extents[0]!.offset=offset;offset+=loc.extents[0]!.length;}
  const meta=makeMeta([...moved,...extraLocations]);
  return concat([...file.top.map(b=>b.type==='meta'?meta:b.raw),...(payloads.length?[box('mdat',...payloads)]:[])]);
}
