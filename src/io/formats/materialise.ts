import { createPixels, tileRect, type TileSource } from '../../core/index.js';
import { createColourPyramid } from '../colour/index.js';
import { orientationTransform } from '../metadata/tiff.js';
import { layerAsset } from './layer-asset.js';
import type { OpenedImage } from '../open-image.js';
import { ensure } from './bytes.js';
import { validateRaster, type DecodedFormat, type DecodedRaster } from './decoder.js';
function orient(raster:DecodedRaster,maxPixels:number) {
  validateRaster(raster,maxPixels);ensure(raster.rgba.length===raster.width*raster.height*4,'Invalid decoded pixels');
  const {width,height,rgba,orientation=1}=raster;if(orientation===1)return raster;
  const transform=orientationTransform(orientation,width,height),out=new Uint8Array(rgba.length),[a,b,c,d,e,f]=transform.matrix as [number,number,number,number,number,number];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const xx=Math.floor(a*(x+.5)+c*(y+.5)+e),yy=Math.floor(b*(x+.5)+d*(y+.5)+f);
    out.set(rgba.subarray((y*width+x)*4,(y*width+x+1)*4),(yy*transform.width+xx)*4);
  }
  return {...raster,width:transform.width,height:transform.height,rgba:out};
}
function source(raster:DecodedRaster,maxPixels:number):OpenedImage {
  const oriented=orient(raster,maxPixels),{width,height,rgba,icc,metadata}=oriented;
  return {width,height,...createColourPyramid(rgba,{width,height},icc),icc,metadata};
}
/** Converts serialisable decoder output into public tile sources and project-ready raster assets. */
export async function materialise(decoded:DecodedFormat,maxPixels:number):Promise<OpenedImage> {
  const opened=source(decoded,maxPixels);opened.importInfo=decoded.importInfo;
  if(decoded.layers?.length) {
    opened.importedLayers=await Promise.all(decoded.layers.map(async layer=> {
      const blob=layerAsset(layer);
      return {spec:layer.spec,source:source(layer,maxPixels),blob};
    }));
    const size={width:opened.width,height:opened.height};
    opened.layerBase={...size,readTile:tile=>{const rect=tileRect(size,tile);return createPixels(rect.width,rect.height);}} satisfies TileSource;
  }
  return opened;
}
