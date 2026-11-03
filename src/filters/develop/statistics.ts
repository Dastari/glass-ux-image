import type { PixelBuffer } from '../../core/pixels.js';
import { clamp, luminance, perceptual, type Triple } from './maths.js';
import type { DevelopParams } from './params.js';

export interface Histogram {
  red: Float64Array; green: Float64Array; blue: Float64Array; luminance: Float64Array;
  /** Sum of contributing alpha; invalid pixels and zero alpha are ignored. */
  weight: number;
  /** Alpha-weighted linear-light pixels at or beyond display black/white. */
  clippedBlack: number; clippedWhite: number;
}
/** Display-perceptual bins of safely un-premultiplied, linear preview pixels.
 * Counts are alpha weighted. HDR goes in the end bins; inputs are never changed.
 */
export function computeHistogram(pixels: PixelBuffer, bins = 256): Histogram {
  if (!Number.isInteger(bins) || bins < 2 || bins > 65536) throw new RangeError('bins must be 2…65536');
  const out: Histogram = { red: new Float64Array(bins), green: new Float64Array(bins), blue: new Float64Array(bins), luminance: new Float64Array(bins), weight: 0, clippedBlack: 0, clippedWhite: 0 };
  forEachPixel(pixels,(c,a) => {
    const l=luminance(c), values=[c[0],c[1],c[2],l];
    [out.red,out.green,out.blue,out.luminance].forEach((array,j)=>{ array[Math.min(bins-1, Math.floor(clamp(perceptual(values[j]!))*bins))]! += a; });
    out.weight+=a;
    if(l<=0) out.clippedBlack+=a;
    if(l>=1) out.clippedWhite+=a;
  });
  return out;
}
function forEachPixel(pixels: PixelBuffer, visit: (c: Triple, alpha: number) => void): void {
  for(let i=0;i<pixels.data.length;i+=4) {
    const a=pixels.data[i+3]!;
    if(!Number.isFinite(a) || a<=0) continue;
    const c=[pixels.data[i]!/a,pixels.data[i+1]!/a,pixels.data[i+2]!/a] as const;
    if(c.every(Number.isFinite)) visit(c.map(x=>Math.max(0,x)) as unknown as Triple,clamp(a));
  }
}
export type AutoEnhanceParams = Pick<DevelopParams,'exposure'|'contrast'|'whites'|'blacks'|'temperature'|'tint'|'vibrance'>;
/** Conservative deterministic suggestions from a small preview, returned as recipe data.
 * Weighted percentiles reject isolated outliers. Flat/clipped images never trigger a
 * division by their range. White balance uses only low-chroma, non-clipped samples;
 * an image without those samples keeps its white balance. No image analysis in filters.
 */
export function autoEnhance(pixels: PixelBuffer): AutoEnhanceParams {
  const result: AutoEnhanceParams={ exposure:0,contrast:0,whites:0,blacks:0,temperature:0,tint:0,vibrance:0 };
  const values: { l:number; a:number }[]=[];
  let weight=0, chroma=0, neutralWeight=0;
  const means=[0,0,0];
  forEachPixel(pixels,(c,a)=>{
    const l=luminance(c); values.push({l,a}); weight+=a;
    const max=Math.max(...c), min=Math.min(...c), s=max>1e-7 ? (max-min)/max : 0;
    chroma+=s*a;
    if(s<0.35 && min>0.01 && max<0.95) {
      neutralWeight+=a;
      for(let j=0;j<3;j++) means[j]!+=c[j]!*a;
    }
  });
  if(!weight) return result;
  values.sort((a,b)=>a.l-b.l);
  const percentile=(q:number)=>{ let at=0; for(const v of values) { at+=v.a; if(at>=q*weight) return v.l; } return values[values.length-1]!.l; };
  const low=percentile(0.02), mid=percentile(0.5), high=percentile(0.98);
  result.exposure=clamp(Math.log2(0.18/Math.max(0.0001,mid)),-2,2);
  const gain=2**result.exposure;
  if(high-low>0.005) {
    const range=perceptual(high*gain)-perceptual(low*gain);
    result.contrast=clamp((0.65-range)*35,-20,20);
    result.whites=clamp((0.95-perceptual(high*gain))*160,-35,35);
    result.blacks=clamp((0.03-perceptual(low*gain))*160,-35,20);
  }
  if(neutralWeight>weight*0.05) {
    const [r,g,b]=means as [number,number,number];
    const t=clamp(Math.log2(b/r)/0.9,-1,1);
    result.temperature=t*100;
    result.tint=clamp((Math.log2(g/Math.sqrt(r*b)))* (500/3),-30,30);
  }
  result.vibrance=clamp((0.35-chroma/weight)*50,0,20);
  return result;
}
