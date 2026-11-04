import { createBytePyramid } from '../../core/byte-pyramid.js';
import { createPixels, srgbToLinear, type PixelBuffer } from '../../core/pixels.js';
import { coarsestLevel, levelSize, tileRect, type Size, type TileAddress } from '../../core/pyramid.js';
import type { IccProfile } from '../metadata/icc.js';
import { profileConversion, type ColourTransform } from './profile.js';
export { profileConversion, readToneCurve, type ColourTransform, type ProfileFailure } from './profile.js';
export { srgbProfile } from './srgb.js';

/** Decode unlabelled source RGB samples. Float mip levels preserve negative and >1 sRGB values. */
export function createColourPyramid(rgba:Uint8Array|Uint8ClampedArray,size:Size,profile?:IccProfile|null) {
  const transform=profile&&profileConversion(profile.bytes).transform;
  if(!transform)return createBytePyramid(rgba,size);
  const levels=new Map<number,PixelBuffer>();
  const read=(tile:TileAddress):PixelBuffer=> {
    const rect=tileRect(size,tile),out=createPixels(rect.width,rect.height),width=levelSize(size,tile.level).width;
    if(tile.level===0) {
      for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++) {
        const from=((rect.y+y)*width+rect.x+x)*4,to=(y*rect.width+x)*4,alpha=rgba[from+3]!/255;
        const rgb=transform.toLinear(rgba[from]!/255,rgba[from+1]!/255,rgba[from+2]!/255);
        for(let c=0;c<3;c++)out.data[to+c]=rgb[c]!*alpha;out.data[to+3]=alpha;
      }
    } else {
      const source=levels.get(tile.level)!;
      for(let y=0;y<rect.height;y++){const from=((rect.y+y)*width+rect.x)*4;out.data.set(source.data.subarray(from,from+rect.width*4),y*rect.width*4);}
    }
    return out;
  };
  // Only the smaller levels are retained as floats; level zero stays in original encoded bytes.
  for(let level=1;level<=coarsestLevel(size);level++) {
    const target=levelSize(size,level),previous=levelSize(size,level-1),out=createPixels(target.width,target.height),source=levels.get(level-1);
    for(let y=0;y<target.height;y++)for(let x=0;x<target.width;x++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) {
      const from=(Math.min(y*2+dy,previous.height-1)*previous.width+Math.min(x*2+dx,previous.width-1))*4,to=(y*target.width+x)*4;
      if(source)for(let c=0;c<4;c++)out.data[to+c]!+=source.data[from+c]!/4;
      else {const alpha=rgba[from+3]!/255,rgb=transform.toLinear(rgba[from]!/255,rgba[from+1]!/255,rgba[from+2]!/255);for(let c=0;c<3;c++)out.data[to+c]!+=rgb[c]!*alpha/4;out.data[to+3]!+=alpha/4;}
    }
    levels.set(level,out);
  }
  return {readTile:read};
}
/** Encode working floats to straight profile RGB bytes, clipping only at this 8-bit output edge. */
export function pixelsToProfile(pixels:PixelBuffer,transform:ColourTransform):Uint8ClampedArray {
  const bytes=new Uint8ClampedArray(pixels.data.length);
  for(let i=0;i<bytes.length;i+=4){const alpha=pixels.data[i+3]!,scale=alpha>0?1/alpha:0,rgb=transform.fromLinear(pixels.data[i]!*scale,pixels.data[i+1]!*scale,pixels.data[i+2]!*scale);for(let c=0;c<3;c++)bytes[i+c]=rgb[c]!*255;bytes[i+3]=alpha*255;}
  return bytes;
}
/** Headless byte API conversion; callers with working floats should use pixelsToProfile instead. */
export function srgbBytesToProfile(bytes:Uint8ClampedArray,transform:ColourTransform):Uint8ClampedArray {
  const out=new Uint8ClampedArray(bytes.length);
  for(let i=0;i<bytes.length;i+=4){const rgb=transform.fromLinear(srgbToLinear(bytes[i]!/255),srgbToLinear(bytes[i+1]!/255),srgbToLinear(bytes[i+2]!/255));for(let c=0;c<3;c++)out[i+c]=rgb[c]!*255;out[i+3]=bytes[i+3]!;}
  return out;
}
