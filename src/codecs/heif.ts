import { pixelLimit, validateRaster, type DecodedFormat, type FormatDecodeOptions } from '../io/formats/decoder.js';
import { checkHeifDimensions } from '../io/formats/heif-header.js';
import { ensure } from '../io/formats/bytes.js';
/** Uses the platform HEIF decoder first. No HEVC implementation or WASM is distributed. */
export async function decodeHeif(blob:Blob,options:FormatDecodeOptions={}):Promise<DecodedFormat> {
  const maxPixels=pixelLimit(options.maxPixels);options.signal?.throwIfAborted();
  checkHeifDimensions(new Uint8Array(await blob.arrayBuffer()),maxPixels);
  try {
    // Safari exposes HEIF through its image decoder on supported OS versions.
    const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});
    try {
      validateRaster(bitmap,maxPixels);const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d',{willReadFrequently:true});ensure(context,'No HEIF canvas');context.drawImage(bitmap,0,0);
      return {width:bitmap.width,height:bitmap.height,rgba:new Uint8Array(context.getImageData(0,0,bitmap.width,bitmap.height).data),importInfo:{kind:'heif'}};
    } finally {bitmap.close();}
  } catch(cause) {
    options.signal?.throwIfAborted();
    // Some Safari/OS combinations expose HEIF on HTMLImageElement before ImageBitmap.
    if(typeof Image!=='undefined') {
      const url=URL.createObjectURL(blob),image=new Image();
      try {
        image.src=url;await image.decode();options.signal?.throwIfAborted();
        const width=image.naturalWidth,height=image.naturalHeight;validateRaster({width,height},maxPixels);
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});ensure(context,'No HEIF canvas');context.drawImage(image,0,0);
        return {width,height,rgba:new Uint8Array(context.getImageData(0,0,width,height).data),importInfo:{kind:'heif'}};
      } catch {options.signal?.throwIfAborted();} finally {image.src='';URL.revokeObjectURL(url);}
    }
    if(!options.loadHeif)throw new Error('HEIF needs a native browser decoder or a host-installed decoder peer',{cause});
    const peer=await options.loadHeif();options.signal?.throwIfAborted();const raster=await peer.decode(blob,{maxPixels,signal:options.signal});validateRaster(raster,maxPixels);
    ensure(raster.rgba.length===raster.width*raster.height*4,'Invalid HEIF peer pixels');options.signal?.throwIfAborted();
    return {...raster,importInfo:{kind:'heif'}};
  }
}
