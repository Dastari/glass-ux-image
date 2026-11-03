import { ascii, bounded, concat, ensure, FileDataError, MAX_METADATA_BYTES, range, u32, utf8 } from '../formats/bytes.js';
import { assemble, chunk, chunks } from '../formats/container.js';
import { sniffFormat } from '../formats/index.js';
import { assembleWebp } from './index.js';
/** Inject zlib for other workers/runtimes. The default uses bounded streaming, never an unbounded Response. */
export interface ProfileCompression { inflate(bytes: Uint8Array): Promise<Uint8Array>; deflate(bytes: Uint8Array): Promise<Uint8Array> }
async function streamUnchecked(bytes: Uint8Array, compress: boolean) {
  const transform=compress?new CompressionStream('deflate'):new DecompressionStream('deflate');
  const reader=new Blob([bytes.slice()]).stream().pipeThrough(transform).getReader(); const parts: Uint8Array[]=[]; let total=0;
  try { for(;;) { const {done,value}=await reader.read(); if(done) break; total+=value.length; ensure(total<=MAX_METADATA_BYTES,'ICC profile exceeds limit'); parts.push(value); } }
  finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  return concat(parts);
}
async function stream(bytes:Uint8Array,compress:boolean) {
  try { return await streamUnchecked(bytes,compress); } catch(cause) { if(cause instanceof FileDataError) throw cause; throw new FileDataError('invalid','Invalid ICC compression stream',{cause}); }
}
/** Browser compression adapter used for embedded PNG profiles. */
export const streamProfileCompression: ProfileCompression={inflate:b=>stream(b,false),deflate:b=>stream(b,true)};
/** Embedded profile bytes and a description-based identification, without pixel conversion. */
export interface IccProfile {
  /** Original complete ICC profile bytes. */
  bytes:Uint8Array;
  /** ICC description, or an explicit unknown-profile label. */
  description:string;
  /** Familiar name inferred from the description; not a validation of the profile tables. */
  colourSpace:'srgb'|'display-p3'|'adobe-rgb'|'other';
}
/** Names identify familiar profiles by description, not by verifying their colourimetric tables.
 * No ICC conversion runs here. Browser decode/canvas may honour supported source profiles;
 * the engine still works in linear sRGB. Reattaching a wide-gamut profile to sRGB output
 * does not make wide-gamut output: the host must convert pixels before labelling them. */
export function describeIcc(bytes: Uint8Array): IccProfile {
  bounded(bytes,MAX_METADATA_BYTES); range(bytes,0,132); ensure(u32(bytes,0)===bytes.length&&ascii(bytes.subarray(36,40))==='acsp','Invalid ICC profile');
  const count=u32(bytes,128); ensure(count<=4096); range(bytes,132,count*12); let description='Unknown ICC profile';
  for(let i=0;i<count;i++) {
    const at=132+i*12, offset=u32(bytes,at+4),size=u32(bytes,at+8); range(bytes,offset,size);
    if(ascii(bytes.subarray(at,at+4))!=='desc') continue;
    const d=bytes.subarray(offset,offset+size); range(d,0,12); const type=ascii(d.subarray(0,4));
    if(type==='desc') { const n=u32(d,8); ensure(n<=4096); range(d,12,n); description=ascii(d.subarray(12,12+n)).replace(/\0.*$/s,''); }
    if(type==='mluc') { const n=u32(d,8), stride=u32(d,12); ensure(n<=128&&stride>=12); range(d,16,n*stride); if(n) { const length=u32(d,20),start=u32(d,24); ensure(length<=8192&&length%2===0); range(d,start,length); description=new TextDecoder('utf-16be').decode(d.subarray(start,start+length)); } }
  }
  const colourSpace=/display\s*p3/i.test(description)?'display-p3':/adobe\s*rgb/i.test(description)?'adobe-rgb':/sRGB/i.test(description)?'srgb':'other';
  return {bytes:bytes.slice(),description,colourSpace};
}
/** Extract and validate a bounded embedded ICC payload without changing image colours. */
export async function extractIcc(bytes: Uint8Array, compression=streamProfileCompression): Promise<IccProfile | null> {
  const format=sniffFormat(bytes); ensure(format==='jpeg'||format==='png'||format==='webp'); const cs=chunks(bytes,format); let data:Uint8Array|undefined;
  if(format==='jpeg') {
    const parts=cs.filter(c=>c.type==='e2'&&ascii(c.data.subarray(0,12))==='ICC_PROFILE\0');
    if(parts.length) { const count=parts[0]!.data[13]; ensure(count===parts.length); const map=new Map<number,Uint8Array>(); for(const c of parts) { ensure(c.data.length>=14&&c.data[13]===count&&c.data[12]!>=1&&c.data[12]!<=count&&!map.has(c.data[12]!)); map.set(c.data[12]!,c.data.subarray(14)); } data=concat(Array.from({length:count},(_,i)=>map.get(i+1)!)); }
  } else {
    const profiles=cs.filter(c=>c.type===(format==='png'?'iCCP':'ICCP')); ensure(profiles.length<=1,'Duplicate ICC profiles'); const c=profiles[0];
    if(c) { if(format==='png') { const zero=c.data.indexOf(0); ensure(zero>0&&zero<=79&&c.data[zero+1]===0); bounded(c.data,MAX_METADATA_BYTES); data=await compression.inflate(c.data.subarray(zero+2)); } else data=c.data; }
  }
  return data?describeIcc(data):null;
}
/** Embedding labels bytes; it does NOT convert linear sRGB pixels to the profile's colour space. */
export async function writeIcc(bytes: Uint8Array, profile: Uint8Array | null, compression=streamProfileCompression) {
  if(profile) describeIcc(profile);
  const format=sniffFormat(bytes); ensure(format==='jpeg'||format==='png'||format==='webp');
  const clean=chunks(bytes,format).filter(c=>format==='jpeg'?!(c.type==='e2'&&ascii(c.data.subarray(0,12))==='ICC_PROFILE\0'):c.type!=='iCCP'&&c.type!=='ICCP'&&!(profile&&format==='png'&&c.type==='sRGB'));
  const added:Uint8Array[]=[];
  if(profile) {
    if(format==='jpeg') { const size=65519,count=Math.ceil(profile.length/size); ensure(count<=255); for(let i=0;i<count;i++) added.push(chunk('e2',concat([utf8('ICC_PROFILE\0'),new Uint8Array([i+1,count]),profile.subarray(i*size,(i+1)*size)]),format)); }
    else added.push(chunk(format==='png'?'iCCP':'ICCP',format==='png'?concat([utf8('ICC\0\0'),await compression.deflate(profile)]):profile,format));
  }
  if(format==='webp') return assembleWebp(bytes,clean,added);
  const at=format==='png'?1:0; return assemble(bytes,[...clean.slice(0,at).map(c=>c.raw),...added,...clean.slice(at).map(c=>c.raw)],format);
}
