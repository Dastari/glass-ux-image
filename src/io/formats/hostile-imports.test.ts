import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import UTIF from 'utif2';
import { decodeTiff } from '../../codecs/tiff.js';
import { decodePsd } from '../../codecs/psd.js';
import { extractRawPreview } from '../../codecs/raw.js';
import { tiffDirectories } from './tiff-directory.js';
import { checkPsd } from './psd-preflight.js';
import { checkTiffJpeg, inflateTiffLzw } from './tiff-payload.js';
type Entry=[number,number,number,number];
function tiff(changes:Entry[]=[],payload=new Uint8Array([0,255]),extras:Entry[]=[]) {
  const entries:Entry[]=[[256,4,1,1],[257,4,1,1],[258,3,1,8],[259,3,1,32773],[262,3,1,1],[273,4,1,0],[277,3,1,1],[278,4,1,1],[279,4,1,payload.length]];
  for(const entry of changes){const i=entries.findIndex(e=>e[0]===entry[0]);if(i<0)entries.push(entry);else entries[i]=entry;}
  entries.push(...extras);const at=8+2+entries.length*12+4,bytes=new Uint8Array(at+Math.max(payload.length,8192)),v=new DataView(bytes.buffer);
  bytes.set([73,73,42,0,8,0,0,0]);v.setUint16(8,entries.length,true);
  entries.forEach(([tag,type,count,value],i)=>{const p=10+i*12;v.setUint16(p,tag,true);v.setUint16(p+2,type,true);v.setUint32(p+4,count,true);value=value===-1||tag===273?at:value;if(type===3&&count===1)v.setUint16(p+8,value,true);else v.setUint32(p+8,value,true);});
  bytes.set(payload,at);return bytes;
}
afterEach(()=>vi.restoreAllMocks());
for(const compression of [1,5,7,8,32946,32773])it(`rejects out-of-file TIFF payloads before compression ${compression} runs`,async()=> {
  const image=vi.spyOn(UTIF,'decodeImage');await expect(decodeTiff(tiff([[259,3,1,compression],[279,4,1,0xffffffff]]))).rejects.toThrow();expect(image).not.toHaveBeenCalled();
});
it('rejects zero RowsPerStrip before the YCbCr infinite loop',async()=> {
  const image=vi.spyOn(UTIF,'decodeImage'),rgba=vi.spyOn(UTIF,'toRGBA8');
  await expect(decodeTiff(tiff([[259,3,1,1],[262,3,1,6],[277,3,1,3],[278,4,1,0]],new Uint8Array(3)))).rejects.toThrow();expect(image).not.toHaveBeenCalled();expect(rgba).not.toHaveBeenCalled();
});
for(const entry of [[256,9,1,0x30000001],[257,8,1,1],[256,4,0,0],[256,4,2,-1],[278,9,1,1],[259,1,1,1],[273,9,1,1]] satisfies Entry[])it(`rejects TIFF structural type/count ${entry.join('/')}`,async()=> {
  const image=vi.spyOn(UTIF,'decodeImage');await expect(decodeTiff(tiff([entry]),1)).rejects.toThrow(/TIFF/);expect(image).not.toHaveBeenCalled();
});
it('validates dimensions using the same unsigned values as the raster decoder',async()=> {
  const image=vi.spyOn(UTIF,'decodeImage');await expect(decodeTiff(tiff([[256,4,1,0x30000001]]),1)).rejects.toThrow('pixel limit');expect(image).not.toHaveBeenCalled();
});
for(const type of [3,4,5,8,9,10,11,12,13])it(`charges aliased type-${type} TIFF values to one aggregate budget`,async()=> {
  const parser=vi.spyOn(UTIF,'decode'),image=vi.spyOn(UTIF,'decodeImage');
  const extras:Entry[]=Array.from({length:64},(_,i)=>[40000+i,type,1024,-1]);
  const bytes=tiff([],undefined,extras);expect(()=>tiffDirectories(bytes)).toThrow('allocation budget');await expect(decodeTiff(bytes)).rejects.toThrow('allocation budget');expect(parser).not.toHaveBeenCalled();expect(image).not.toHaveBeenCalled();
});
it('charges aliases across directories, including GPS pointers',()=> {
  const bytes=tiff([],undefined,[[40000,5,8192,-1],[34853,4,1,7000]]);
  // The rational payload itself needs 64 KiB; directory one and directory two alias it.
  const larger=new Uint8Array(70000);larger.set(bytes);const w=new DataView(larger.buffer);w.setUint16(7000,1,true);w.setUint16(7002,40001,true);w.setUint16(7004,5,true);w.setUint32(7006,8192,true);w.setUint32(7010,200,true);
  expect(()=>tiffDirectories(larger)).toThrow('allocation budget');
});
it('ignores unneeded private metadata pointers instead of invoking UTIF recursive parsing',async()=> {
  const parser=vi.spyOn(UTIF,'decode');const image=await decodeTiff(tiff([],undefined,[[50740,7,4,8],[37500,7,4,8]]));expect(image.rgba).toEqual(new Uint8Array([255,255,255,255]));expect(parser).not.toHaveBeenCalled();
});
for(const entry of [[278,4,1,0],[279,4,1,0],[273,4,2,-1],[322,4,1,0],[323,4,1,0],[259,3,1,65535],[262,3,1,6],[258,3,2,-1]] satisfies Entry[])it(`rejects inconsistent TIFF geometry/layout ${entry.join('/')}`,async()=> {
  const image=vi.spyOn(UTIF,'decodeImage');await expect(decodeTiff(tiff([entry]))).rejects.toThrow();expect(image).not.toHaveBeenCalled();
});
it('rejects truncated and overflowing PackBits before UTIF',async()=> {
  const image=vi.spyOn(UTIF,'decodeImage');for(const data of [new Uint8Array([3,1]),new Uint8Array([129,0]),new Uint8Array([128])])await expect(decodeTiff(tiff([],data))).rejects.toThrow();expect(image).not.toHaveBeenCalled();
});
it('bounds Deflate output by strip geometry rather than the global image limit',async()=> {
  const image=vi.spyOn(UTIF,'decodeImage');const data=deflateSync(new Uint8Array(1024*1024));await expect(decodeTiff(tiff([[259,3,1,8]],data))).rejects.toThrow('inflated strip');expect(image).not.toHaveBeenCalled();
});
it('rejects invalid LZW codes without following cyclic dictionary links',()=> {
  const codes=[256,511,257],packed=new Uint8Array(4);let bit=0;for(const code of codes)for(let n=8;n>=0;n--,bit++)packed[bit>>3]!|=((code>>n)&1)<<(7-(bit&7));expect(()=>inflateTiffLzw(packed,1)).toThrow('LZW');
});
it('rejects oversized JPEG-in-TIFF frames before JPEG allocation',async()=> {
  const jpeg=new Uint8Array([255,216,255,192,0,17,8,127,255,127,255,3,1,0x11,0,2,0x11,0,3,0x11,0,255,218,0,2]);
  const bytes=tiff([[259,3,1,7],[262,3,1,2],[277,3,1,3],[258,3,3,-1]],jpeg),v=new DataView(bytes.buffer),at=v.getUint32(10+2*12+8,true),depths=bytes.length-6;v.setUint32(10+2*12+8,depths,true);for(let i=0;i<3;i++)v.setUint16(depths+i*2,8,true);expect(bytes[at]).toBe(255);
  const image=vi.spyOn(UTIF,'decodeImage');await expect(decodeTiff(bytes)).rejects.toThrow('JPEG dimensions disagree');expect(image).not.toHaveBeenCalled();
});
const psd=()=>new Uint8Array(readFileSync(new URL('../../../e2e/fixtures/imports/layers.psd',import.meta.url)));
function layerStart(bytes:Uint8Array){const v=new DataView(bytes.buffer);let p=26;p+=4+v.getUint32(p);p+=4+v.getUint32(p);return p+8;}
it('preflights PSD layer and channel counts before ag-psd',async()=> {
  for(const channels of [false,true]) {
    const bytes=psd(),start=layerStart(bytes),v=new DataView(bytes.buffer);v.setUint16(channels?start+2+16:start,0x7fff);
    await expect(decodePsd(bytes)).rejects.toThrow(channels?'layer channels':'PSD layers');
  }
});
it('rejects PSD layer channel payloads outside their parent section',async()=> {
  const bytes=psd(),v=new DataView(bytes.buffer);v.setUint32(layerStart(bytes)+2+20,0xffffffff);await expect(decodePsd(bytes)).rejects.toThrow('parent bounds');
});
it('enforces the PSD layer pixel budget before ag-psd allocates any pixels',async()=> {
  const bytes=psd(),v=new DataView(bytes.buffer),layer=layerStart(bytes)+2;v.setInt32(layer+8,30000);v.setInt32(layer+12,30000);await expect(decodePsd(bytes)).rejects.toThrow('pixel limit');
});
it('rejects a PSD nested section that fits the file but escapes its parent',()=> {
  const bytes=psd(),v=new DataView(bytes.buffer);v.setUint32(layerStart(bytes)-4,bytes.length-100);expect(()=>checkPsd(bytes,100)).toThrow('parent bounds');
});
it('PSD layer ZIP inflation stays bounded to the declared channel size',async()=> {
  const zipped=deflateSync(new Uint8Array(1024*1024)),channel=new Uint8Array(zipped.length+2);new DataView(channel.buffer).setUint16(0,2);channel.set(zipped,2);
  const record=new Uint8Array(52),r=new DataView(record.buffer);r.setInt32(8,1);r.setInt32(12,1);r.setUint16(16,1);r.setUint32(20,channel.length);record.set([56,66,73,77,110,111,114,109,255,0,0,0],24);r.setUint32(36,12);
  const infoLength=2+record.length+channel.length,padded=infoLength+infoLength%2,maskLength=4+padded+4;
  const bytes=new Uint8Array(26+4+4+4+maskLength+5),v=new DataView(bytes.buffer);bytes.set([56,66,80,83]);v.setUint16(4,1);v.setUint16(12,3);v.setUint32(14,1);v.setUint32(18,1);v.setUint16(22,8);v.setUint16(24,3);v.setUint32(34,maskLength);v.setUint32(38,padded);v.setUint16(42,1);bytes.set(record,44);bytes.set(channel,96);
  const image=await decodePsd(bytes,1);expect(image.rgba).toHaveLength(4);expect(image.layers).toHaveLength(1);expect(image.layers![0]!.rgba).toHaveLength(4);
});
it('bounds repeated false RAW JPEG scans',()=> {
  // Each candidate ends immediately at the next SOI, but there must still be a count bound.
  const bytes=new Uint8Array(5*5000);for(let i=0;i<5000;i++)bytes.set([255,216,255,0,0],i*5);expect(()=>extractRawPreview(bytes)).toThrow('Too many RAW JPEG candidates');
});
it('bounds repeated RAW metadata probes before parsing candidate TIFF directories',()=> {
  const bytes=new Uint8Array(129*16);for(let i=0;i<129;i++)bytes.set([69,120,105,102,0,0],i*16);expect(()=>extractRawPreview(bytes)).toThrow('Too many RAW metadata candidates');
});

it('decodes bounded padded TIFF tiles',async()=> {
  vi.spyOn(console,'log').mockImplementation(()=>{});
  const payload=new Uint8Array(256).fill(255),bytes=tiff([[259,3,1,1],[322,4,1,16],[323,4,1,16],[324,4,1,-1],[325,4,1,256]],payload);
  const image=await decodeTiff(bytes,1);expect(image.rgba).toEqual(new Uint8Array([255,255,255,255]));
});
it('decodes LZW across dictionary width changes and resets',()=> {
  const values=Uint8Array.from({length:6000},(_,i)=>(i*37)&255),bits:number[]=[];let width=9,next=258,previous=false;
  const emit=(code:number)=>{for(let b=width-1;b>=0;b--)bits.push((code>>>b)&1);};
  emit(256);
  for(let i=0;i<values.length;i++) {
    if(i===4500){emit(256);width=9;next=258;previous=false;}
    emit(values[i]!);if(previous&&next<4096){next++;if(next===(1<<width)-1&&width<12)width++;}previous=true;
  }
  emit(257);const packed=new Uint8Array(Math.ceil(bits.length/8));bits.forEach((bit,i)=>packed[i>>>3]!|=bit<<(7-(i&7)));
  expect(inflateTiffLzw(packed,values.length)).toEqual(values);
});
for(const type of [1,2,6,7])it(`charges aliased type-${type} byte/string TIFF values to the allocation budget`,()=> {
  const count=128*1024,extras:Entry[]=Array.from({length:64},(_,i)=>[40000+i,type,count,-1]);
  const bytes=tiff([],new Uint8Array(count),extras);expect(()=>tiffDirectories(bytes)).toThrow('allocation budget');
});
it('decodes the LZW special next-code case',()=> {
  const codes=[256,65,258,257],packed=new Uint8Array(Math.ceil(codes.length*9/8));let bit=0;
  for(const code of codes)for(let n=8;n>=0;n--,bit++)packed[bit>>>3]!|=((code>>>n)&1)<<(7-(bit&7));
  expect(inflateTiffLzw(packed,3)).toEqual(new Uint8Array([65,65,65]));
});

it('rejects JPEG DNL after entropy data before UTIF can reallocate with a different height',()=> {
  const bytes=new Uint8Array([255,216,255,192,0,11,8,0,1,0,1,1,1,0x11,0,255,218,0,8,1,1,0,0,63,0,17,255,0,255,220,0,4,255,255,255,217]);
  expect(()=>checkTiffJpeg(bytes,1,1)).toThrow('Unsupported TIFF JPEG frame');
});
