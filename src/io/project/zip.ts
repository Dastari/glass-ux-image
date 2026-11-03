import { bounded, concat, crc32, ensure, FileDataError, range, u16, u32, utf8 } from '../formats/bytes.js';
export interface ZipEntry { name:string; bytes:Uint8Array }
const safeName=(name:string)=> { ensure(name.length>0&&name.length<=1024&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').some(p=>p==='..'||p==='.'||!p)&&![...name].some(c=>c.charCodeAt(0)<32),'Unsafe ZIP path'); };
/** ZIP32, method STORE, UTF-8 names; no dependency, encryption, descriptors or ZIP64. */
export function writeZip(entries: readonly ZipEntry[]) {
  ensure(entries.length<=4096); const locals:Uint8Array[]=[],central:Uint8Array[]=[]; const seen=new Set<string>(); let offset=0;
  for(const e of entries) {
    safeName(e.name); ensure(!seen.has(e.name),'Duplicate ZIP entry'); seen.add(e.name); bounded(e.bytes); const name=utf8(e.name); const crc=crc32(e.bytes);
    const header=new Uint8Array(30+name.length); const v=new DataView(header.buffer);
    v.setUint32(0,0x04034b50,true); v.setUint16(4,20,true); v.setUint16(6,0x800,true); v.setUint32(14,crc,true); v.setUint32(18,e.bytes.length,true); v.setUint32(22,e.bytes.length,true); v.setUint16(26,name.length,true); header.set(name,30);
    const c=new Uint8Array(46+name.length); const cv=new DataView(c.buffer); cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0x800,true); cv.setUint32(16,crc,true); cv.setUint32(20,e.bytes.length,true); cv.setUint32(24,e.bytes.length,true); cv.setUint16(28,name.length,true); cv.setUint32(42,offset,true); c.set(name,46);
    locals.push(header,e.bytes); central.push(c); offset+=header.length+e.bytes.length;
  }
  const directory=concat(central),end=new Uint8Array(22),v=new DataView(end.buffer); v.setUint32(0,0x06054b50,true); v.setUint16(8,entries.length,true); v.setUint16(10,entries.length,true); v.setUint32(12,directory.length,true); v.setUint32(16,offset,true);
  return concat([...locals,directory,end]);
}
export interface ZipRange { name:string; offset:number; length:number; crc:number }
/** Returns byte ranges into an uncompressed archive. CRC is checked by readZip, not this index. */
export function indexZip(bytes: Uint8Array): ZipRange[] {
  bounded(bytes); ensure(bytes.length>=22); const end=bytes.length-22; ensure(u32(bytes,end,true)===0x06054b50,'Missing ZIP footer');
  ensure(u16(bytes,end+4,true)===0&&u16(bytes,end+6,true)===0&&u16(bytes,end+20,true)===0,'Multipart/commented ZIP unsupported');
  const count=u16(bytes,end+10,true),size=u32(bytes,end+12,true),start=u32(bytes,end+16,true); ensure(count<=4096&&u16(bytes,end+8,true)===count&&start+size===end);
  let p=start; const ranges:ZipRange[]=[],seen=new Set<string>(); let previousEnd=0;
  for(let i=0;i<count;i++) {
    range(bytes,p,46); ensure(u32(bytes,p,true)===0x02014b50); const flags=u16(bytes,p+8,true),method=u16(bytes,p+10,true);
    if((flags&~0x800)!==0||method!==0) throw new FileDataError('unsupported','Only unencrypted STORE ZIP entries are supported');
    const length=u32(bytes,p+24,true),nameLength=u16(bytes,p+28,true),extra=u16(bytes,p+30,true),comment=u16(bytes,p+32,true),local=u32(bytes,p+42,true),crc=u32(bytes,p+16,true);
    ensure(length===u32(bytes,p+20,true)&&u16(bytes,p+34,true)===0); range(bytes,p+46,nameLength+extra+comment);
    let name:string; try { name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+nameLength)); } catch(cause) { throw new FileDataError('invalid','Invalid ZIP filename',{cause}); }
    safeName(name); ensure(!seen.has(name),'Duplicate ZIP entry'); seen.add(name);
    ensure(local===previousEnd&&u32(bytes,local,true)===0x04034b50); range(bytes,local,30);
    ensure(u16(bytes,local+6,true)===flags&&u16(bytes,local+8,true)===0&&u32(bytes,local+14,true)===crc&&u32(bytes,local+18,true)===length&&u32(bytes,local+22,true)===length&&u16(bytes,local+26,true)===nameLength);
    const localExtra=u16(bytes,local+28,true),offset=local+30+nameLength+localExtra; range(bytes,local+30,nameLength+localExtra); ensure(bytes.subarray(local+30,local+30+nameLength).every((b,j)=>b===bytes[p+46+j]));
    ensure(offset+length<=start); ranges.push({name,offset,length,crc}); previousEnd=offset+length; p+=46+nameLength+extra+comment;
  }
  ensure(p===end&&previousEnd===start); return ranges;
}
/** Read stored ZIP entries with bounds and integrity validation; rejects unsupported compression. */
export function readZip(bytes:Uint8Array): ZipEntry[] { return indexZip(bytes).map(e=> { const data=bytes.slice(e.offset,e.offset+e.length); ensure(crc32(data)===e.crc,'ZIP CRC mismatch'); return {name:e.name,bytes:data}; }); }
