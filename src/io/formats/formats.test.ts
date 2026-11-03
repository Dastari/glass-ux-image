import { describe, expect, it, vi } from 'vitest';
import { FileDataError, utf8 } from './bytes.js';
import { gifFrameCount, nativeEncodeSupport, rasteriseSvg, sniffFormat } from './index.js';
import { importFile, type ImportDecoder } from './import.js';
import { readMetadata } from '../metadata/index.js';
import { describeIcc } from '../metadata/icc.js';
import { readExif } from '../metadata/tiff.js';
import { readProject } from '../project/index.js';
const gif=()=>new Uint8Array([...utf8('GIF89a'),1,0,1,0,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,0x44,1,0,0x3b]);
describe('format boundaries',()=> {
  it('sniffs bytes and counts GIF descriptors without scanning compressed bytes',()=> { expect(sniffFormat(gif())).toBe('gif'); expect(gifFrameCount(gif())).toBe(1); expect(sniffFormat(utf8('<?xml version="1.0"?><svg/>'.replace('<svg/>','<svg></svg>')))).toBe('svg'); expect(()=>sniffFormat(utf8('photo.png'))).toThrow(FileDataError); });
  it('rejects truncated GIFs and illegal blocks',()=> { const b=gif(); for(let i=0;i<b.length;i++) expect(()=>gifFrameCount(b.slice(0,i))).toThrow(FileDataError); b[13]=99; expect(()=>gifFrameCount(b)).toThrow(FileDataError); });
  it('requests first-frame oriented decoding',async()=> { const decode=vi.fn<ImportDecoder<{pixels:boolean}>['decode']>(async()=>({pixels:true})); const result=await importFile(gif(),{decoder:{decode}}); expect(result.frameCount).toBe(1); expect(result.orientationApplied).toBe(true); expect(decode.mock.calls[0]?.[1]).toEqual({orientation:'from-image',frameIndex:0,maxPixels:16*1024*1024}); });
  it('rasterises SVG only behind an explicit sanitisation boundary and size policy',async()=> { const sanitise=vi.fn(()=>'<svg xmlns="http://www.w3.org/2000/svg"/>'),rasterise=vi.fn(async()=>new Blob()); await rasteriseSvg(utf8('<svg></svg>'),100,100,{sanitise,rasterise}); expect(sanitise).toHaveBeenCalledOnce(); await expect(rasteriseSvg(utf8('<svg></svg>'),100000,100,{sanitise,rasterise})).rejects.toThrow(FileDataError); expect(rasterise).toHaveBeenCalledOnce(); });
  it('detects silent PNG fallback, including native AVIF availability',async()=> { const result=await nativeEncodeSupport({encode:async type=>new Blob([],{type:type==='image/avif'?'image/png':type})}); expect(result).toEqual({'image/png':true,'image/jpeg':true,'image/webp':true,'image/avif':false}); });
  it('never leaks RangeError/TypeError on deterministic random or mutated parser inputs',()=> {
    let seed=1234567; const random=()=> { seed^=seed<<13; seed^=seed>>>17; seed^=seed<<5; return seed>>>0; };
    const parsers=[sniffFormat,gifFrameCount,readMetadata,describeIcc,readExif,readProject];
    for(let n=0;n<500;n++) { const b=Uint8Array.from({length:random()%256},()=>random()&255); for(const parse of parsers) try { parse(b); } catch(error) { expect(error).toBeInstanceOf(FileDataError); } }
  });
});

import { checkImageDimensions, imageDimensions } from './dimensions.js';
it('reads raster dimensions before allocation and rejects oversized headers',()=> {
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set(utf8('IHDR'),12);new DataView(png.buffer).setUint32(16,300000);new DataView(png.buffer).setUint32(20,200000);expect(imageDimensions(png)).toEqual({width:300000,height:200000});expect(()=>checkImageDimensions(png)).toThrow(FileDataError);
 const g=gif();expect(imageDimensions(g)).toEqual({width:1,height:1});for(let i=0;i<10;i++)expect(()=>imageDimensions(g.slice(0,i))).toThrow(FileDataError);
});
