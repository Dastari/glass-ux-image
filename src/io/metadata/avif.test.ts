import { expect,it } from 'vitest';
import { ascii,concat,u32,utf8 } from '../formats/bytes.js';
import { srgbProfile } from '../colour/index.js';
import { readAvifMetadata,writeAvifMetadata } from './avif.js';
import type { ImageMetadata } from './index.js';
const word=(n:number)=>{const bytes=new Uint8Array(4);new DataView(bytes.buffer).setUint32(0,n);return bytes;};
const short=(n:number)=>new Uint8Array([n>>>8,n&255]);
const box=(type:string,...data:Uint8Array[])=>{const payload=concat(data);return concat([word(payload.length+8),utf8(type),payload]);};
function avif(version=0) {
  const ftyp=box('ftyp',utf8('avif'),word(0),utf8('avifmif1miaf'));
  const primary=box('pitm',word(0),short(1)),iinf=box('iinf',word(0),short(1),box('infe',new Uint8Array([2,0,0,0]),short(1),short(0),utf8('av01Colour\0')));
  const iprp=box('iprp',box('ipco',box('colr',utf8('nclx'),short(1),short(13),short(6),new Uint8Array([128]))),box('ipma',word(0),word(1),short(1),new Uint8Array([1,1])));
  const iloc=(offset:number)=>box('iloc',new Uint8Array([version,0,0,0,0x44,0]),short(1),short(1),...(version?[short(0)]:[]),short(0),short(1),word(offset),word(5));
  const meta=box('meta',word(0),primary,iloc(0),iinf,iprp),offset=ftyp.length+meta.length+8;
  return concat([ftyp,box('meta',word(0),primary,iloc(offset),iinf,iprp),box('mdat',new Uint8Array([1,2,3,4,5]))]);
}
function metadata():ImageMetadata {
  const tiff=new Uint8Array(26),v=new DataView(tiff.buffer);tiff.set(utf8('II'));v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,1,true);v.setUint16(10,0x112,true);v.setUint16(12,3,true);v.setUint32(14,1,true);v.setUint16(18,6,true);
  return {format:'jpeg',fields:{orientation:6},presence:{exif:true,xmp:true,iptc:false},packets:[{kind:'exif',data:tiff},{kind:'xmp',data:utf8('<r tiff:Orientation="6" exif:GPSLatitude="30N" dc:title="Keep"/>')}]};
}
for(const version of [0,1])for(const mode of ['preserve','strip','strip-gps'] as const)it(`AVIF iloc v${version} ${mode}: EXIF, XMP, ICC and corrected AV1 extents`,()=>{
  const output=writeAvifMetadata(avif(version),metadata(),{mode,pixelsOriented:true},srgbProfile()),result=readAvifMetadata(output);
  expect(result.icc).toEqual(srgbProfile());expect(result.metadata.presence).toEqual({exif:mode!=='strip',xmp:mode!=='strip',iptc:false});
  if(mode!=='strip'){expect(result.metadata.fields.orientation).toBe(1);const xmp=ascii(result.metadata.packets[1]!.data);expect(xmp).toContain('Orientation="1"');expect(xmp.includes('GPSLatitude')).toBe(mode==='preserve');expect(xmp).toContain('Keep');}
  // Read the rewritten absolute iloc image extent independently of the metadata reader.
  const marker=output.findIndex((_,i)=>ascii(output.subarray(i,i+4))==='iloc'),data=marker+4;
  const start=u32(output,data+16);expect(output.subarray(start,start+5)).toEqual(new Uint8Array([1,2,3,4,5]));
});
it('AVIF keeps nclx without an ICC payload',()=>{const output=writeAvifMetadata(avif(),undefined,{mode:'strip'},null);expect(readAvifMetadata(output).icc).toBeNull();expect(ascii(output)).toContain('nclx');});
it('AVIF rejects truncated or malicious structure',()=>{const valid=avif();for(let i=0;i<valid.length;i++)expect(()=>writeAvifMetadata(valid.slice(0,i),undefined,{mode:'strip'},null)).toThrow();const broken=valid.slice();new DataView(broken.buffer).setUint32(0,0xffffffff);expect(()=>readAvifMetadata(broken)).toThrow();});
