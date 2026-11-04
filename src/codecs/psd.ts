import { initializeCanvas, readPsd, type Layer, type PixelData } from 'ag-psd';
import { BLEND_MODES, type BlendMode } from '../core/index.js';
import { ensure, u16, u32 } from '../io/formats/bytes.js';
import { pixelLimit, validateRaster, type DecodedFormat, type DecodedLayer } from '../io/formats/decoder.js';
import { checkPsd } from '../io/formats/psd-preflight.js';
import { describeIcc } from '../io/metadata/icc.js';
function rgba8(image:PixelData) {
  const out=new Uint8Array(image.width*image.height*4);ensure(image.data.length===out.length,'Invalid PSD pixel data');
  const scale=image.data instanceof Uint16Array?255/65535:image.data instanceof Float32Array?255:1;
  for(let i=0;i<out.length;i++)out[i]=Math.round(Math.max(0,Math.min(255,image.data[i]!*scale)));return out;
}
/** Read composite plus bottom-first raster layers. Text/smart objects use their saved raster pixels. */
export async function decodePsd(bytes:Uint8Array,maxPixels?:number):Promise<DecodedFormat> {
  const limit=pixelLimit(maxPixels);checkPsd(bytes,limit);ensure(u16(bytes,4)===1,'PSB is not supported');
  validateRaster({width:u32(bytes,18),height:u32(bytes,14)},limit);
  // useImageData avoids alpha damage through canvas and works in an image worker.
  initializeCanvas((w,h)=>new OffscreenCanvas(w,h) as unknown as HTMLCanvasElement,(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4),colorSpace:'srgb'} as ImageData));
  const psd=readPsd(bytes,{useImageData:true,skipThumbnail:true,skipLinkedFilesData:true,totalMemoryLimit:Math.min(512*1024*1024,limit*32),imageResourcesWhitelist:['iccProfile']});
  ensure(psd.imageData,'PSD has no saved composite');const warnings=new Set<string>(),layers:DecodedLayer[]=[];
  const icc=psd.imageResources?.iccProfile?describeIcc(psd.imageResources.iccProfile):null;
  let total=psd.width*psd.height;
  function visit(children:Layer[],visible=true,opacity=1) {
    for(const layer of children) {
      if(layer.children) {warnings.add('psd-groups-flattened');visit(layer.children,visible&&!layer.hidden,opacity*(layer.opacity??1));continue;}
      const image=layer.imageData;if(!image||!image.width||!image.height)continue;
      validateRaster(image,limit);total+=image.width*image.height;ensure(total<=limit*8,'PSD layers exceed pixel budget');
      const name=layer.name??'',left=layer.left??0,top=layer.top??0;
      const mode=(layer.blendMode??'normal').replaceAll(' ','-').replace('color','colour') as BlendMode;
      const blend=BLEND_MODES.includes(mode)?mode:'normal';if(blend!==mode)warnings.add('psd-blend-fallback');
      if(layer.mask||layer.vectorMask||layer.effects||layer.clipping)warnings.add('psd-layer-features-not-applied');
      layers.push({width:image.width,height:image.height,rgba:rgba8(image),icc,
        spec:{id:`psd-${layers.length+1}`,name,kind:'image',visible:visible&&!layer.hidden,opacity:opacity*(layer.opacity??1),blend,quad:[[left,top],[left+image.width,top],[left+image.width,top+image.height],[left,top+image.height]]}});
    }
  }
  visit(psd.children??[]);
  return {width:psd.width,height:psd.height,rgba:rgba8(psd.imageData),icc,layers,importInfo:{kind:'psd',warnings:[...warnings]}};
}
