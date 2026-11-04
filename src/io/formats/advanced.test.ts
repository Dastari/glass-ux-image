import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { decodeTiff } from '../../codecs/tiff.js';
import { decodePsd } from '../../codecs/psd.js';
import { extractRawPreview } from '../../codecs/raw.js';
import { readMetadata, writeMetadata } from '../metadata/index.js';
import { sniffFormat } from './index.js';
import { checkHeifDimensions } from './heif-header.js';
import { layerAsset } from './layer-asset.js';
import { materialise } from './materialise.js';
import { tiffDirectories } from './tiff-directory.js';
import { concat, utf8 } from './bytes.js';
const fixture=(name:string)=>new Uint8Array(readFileSync(new URL(`../../../e2e/fixtures/imports/${name}`,import.meta.url)));
const jpeg=(w:number,h:number)=>new Uint8Array([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,1,1,0x11,0,255,218,0,8,1,1,0,0,63,0,7,255,0,3,255,217]);
describe('advanced imports',()=> {
 for(const name of ['rgba8.tif','rgba16.tif','rgba16-be.tif','deflate.tif','lzw.tif','packbits.tif','multipage.tif'])it(`decodes ${name}`,async()=> {
   const decoded=await decodeTiff(fixture(name));expect([decoded.width,decoded.height]).toEqual([3,2]);expect(Array.from(decoded.rgba.slice(0,12))).toEqual([255,0,0,255,0,255,0,255,0,0,255,255]);expect(decoded.importInfo.pageCount).toBe(name==='multipage.tif'?2:1);
 });
 it('unpremultiplies associated TIFF alpha at the edge',async()=> {const image=await decodeTiff(fixture('associated.tif'));expect(Array.from(image.rgba.slice(12,16))).toEqual([255,128,64,128]);});
 it('honours all eight TIFF orientations',async()=> {
   const bytes=fixture('oriented.tif');for(let orientation=1;orientation<=8;orientation++) {
     const v=new DataView(bytes.buffer);v.setUint16(8+2+6*12+8,orientation,true);const decoded=await decodeTiff(bytes),source=await materialise(decoded,100);
     expect([source.width,source.height]).toEqual(orientation>=5?[2,3]:[3,2]);const tile=await source.readTile({level:0,x:0,y:0});expect(tile.data.filter((_,i)=>i%4===3).reduce((n,x)=>n+x,0)).toBeCloseTo(4+128/255,4);
   }
 });
 it('rejects limits before TIFF or PSD bitmap allocation',async()=> {await expect(decodeTiff(fixture('rgba8.tif'),5)).rejects.toThrow('pixel limit');await expect(decodePsd(fixture('layers.psd'),10)).rejects.toThrow('pixel limit');});
 it('maps PSD layers bottom first with names, opacity, visibility, offsets and supported blends',async()=> {
   const image=await decodePsd(fixture('layers.psd'));expect([image.width,image.height]).toEqual([6,4]);expect(Array.from(image.rgba.slice(0,4))).toEqual([40,80,120,255]);
   expect(image.layers?.map(l=>l.spec.name)).toEqual(['Bottom','Offset','Hidden']);expect(image.layers?.[1]?.spec).toMatchObject({opacity:128/255,visible:true,blend:'multiply',quad:[[2,1],[4,1],[4,3],[2,3]]});expect(image.layers?.[2]?.spec).toMatchObject({visible:false,blend:'colour-dodge',quad:[[-1,0],[1,0],[1,1],[-1,1]]});
 });
 it('chooses the largest complete RAW JPEG by area, ignoring stuffing and truncated candidates',()=> {
   const bytes=concat([utf8('FUJIFILMCCD-RAW '),jpeg(2,2),jpeg(9,7),jpeg(3,3),jpeg(100,100).slice(0,-2)]),preview=extractRawPreview(bytes);
   expect(sniffFormat(bytes)).toBe('raw');expect(preview.orientation).toBe(1);expect(preview.jpeg).toContain(0xda);expect(()=>extractRawPreview(bytes,60)).toThrow('pixel limit');
   expect(()=>extractRawPreview(utf8('FUJIFILMCCD-RAW '))).toThrow('No embedded JPEG');
 });
 it('keeps TIFF RAW orientation on the extracted preview',()=> {
   const raw=fixture('oriented.tif'),bytes=concat([raw,jpeg(4,2)]),result=extractRawPreview(bytes);expect(result.orientation).toBe(6);
   expect(sniffFormat(result.jpeg)).toBe('jpeg');
 });
 it('detects camera and HEIF signatures independently of MIME/extensions',()=> {
   expect(sniffFormat(concat([utf8('IIRO'),new Uint8Array(12)]))).toBe('raw');
   const cr2=fixture('rgba8.tif');cr2.set([67,82,2,0],8);expect(sniffFormat(cr2)).toBe('raw');
   for(const brand of ['heic','heix','mif1','crx '])expect(sniffFormat(concat([new Uint8Array([0,0,0,20]),utf8(`ftyp${brand}`),new Uint8Array(8)]))).toBe(brand==='crx '?'raw':'heif');
   expect(sniffFormat(fixture('layers.psd'))).toBe('psd');
 });
 it('rejects cyclic and truncated TIFF directories',()=> {const bytes=fixture('rgba8.tif');new DataView(bytes.buffer).setUint32(8+2+12*12,8,true);expect(()=>tiffDirectories(bytes)).toThrow('Cyclic');for(let i=0;i<150;i+=7)expect(()=>tiffDirectories(bytes.slice(0,i))).toThrow();});
 it('checks HEIF ispe properties before native decode',()=> {
   const property=new Uint8Array(12);new DataView(property.buffer).setUint32(4,100000);new DataView(property.buffer).setUint32(8,100000);
   const box=(type:string,data:Uint8Array)=>{const b=new Uint8Array(8+data.length);new DataView(b.buffer).setUint32(0,b.length);b.set(utf8(type),4);b.set(data,8);return b;};
   const bytes=box('meta',concat([new Uint8Array(4),box('iprp',box('ipco',box('ispe',property)))]));expect(()=>checkHeifDimensions(bytes,100)).toThrow('pixel limit');
 });
 it('HEIF only calls the host dynamic loader after native decoding fails',async()=> {
   const {decodeHeif}=await import('../../codecs/heif.js');const native=vi.fn(async()=>{throw new Error('unsupported');}),load=vi.fn(async()=>({decode:async()=>({width:1,height:1,rgba:new Uint8Array([255,0,0,255])})}));vi.stubGlobal('createImageBitmap',native);
   const box=concat([new Uint8Array([0,0,0,20]),utf8('ftypheic'),new Uint8Array(8)]);
   try {await expect(decodeHeif(new Blob([box]))).rejects.toThrow('host-installed');const image=await decodeHeif(new Blob([box]),{loadHeif:load});expect(image.importInfo.kind).toBe('heif');expect(load).toHaveBeenCalledOnce();}finally {vi.unstubAllGlobals();}
 });
});

it('lossless layer assets retain low-alpha RGB exactly through TIFF decoding',async()=> {const rgba=new Uint8Array([71,191,37,13,127,31,213,1]);const blob=layerAsset({width:2,height:1,rgba});expect(blob.type).toBe('image/tiff');const image=await decodeTiff(new Uint8Array(await blob.arrayBuffer()));expect(image.rgba).toEqual(rgba);});

it('RAW container orientation overrides a stale preview tag while retaining camera EXIF',()=> {
 const exif=new Uint8Array(38),v=new DataView(exif.buffer);exif.set([73,73,42,0,8,0,0,0]);v.setUint16(8,2,true);v.setUint16(10,274,true);v.setUint16(12,3,true);v.setUint32(14,1,true);v.setUint16(18,1,true);v.setUint16(22,271,true);v.setUint16(24,2,true);v.setUint32(26,4,true);exif.set([67,97,109,0],30);
 const preview=writeMetadata(jpeg(4,2),{format:'jpeg',packets:[{kind:'exif',data:exif}],fields:{orientation:1},presence:{exif:true,xmp:false,iptc:false}},{mode:'preserve'});
 const raw=concat([fixture('oriented.tif'),preview]);expect(readMetadata(extractRawPreview(raw).jpeg).fields).toMatchObject({orientation:6,cameraMake:'Cam'});
});

it('RAW preview EXIF comes from the largest JPEG, not a differently rotated thumbnail',()=> {
 function tagged(width:number,height:number,orientation:number) {const exif=new Uint8Array(26),view=new DataView(exif.buffer);exif.set([73,73,42,0,8,0,0,0]);view.setUint16(8,1,true);view.setUint16(10,274,true);view.setUint16(12,3,true);view.setUint32(14,1,true);view.setUint16(18,orientation,true);return writeMetadata(jpeg(width,height),{format:'jpeg',packets:[{kind:'exif',data:exif}],fields:{orientation},presence:{exif:true,xmp:false,iptc:false}},{mode:'preserve'});}
 const raw=concat([utf8('FUJIFILMCCD-RAW '),tagged(2,1,1),tagged(8,4,6)]);expect(extractRawPreview(raw).orientation).toBe(6);
});
