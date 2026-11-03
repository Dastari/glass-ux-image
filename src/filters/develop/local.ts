import type { FilterFrame, FilterPass } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { clamp, linear, luminance, perceptual, smooth, type Triple } from './maths.js';
import { colourGlsl } from './shaders.js';
export type LocalControl = 'clarity' | 'texture' | 'dehaze';
/** Gaussian sigma, in full-resolution output pixels. */
export const LOCAL_RADII = Object.freeze({ clarity: 12, texture: 1.5, dehaze: 24 });
export const localPadding = (kind: LocalControl, scale: number): number => gaussianBlur.padding({ sigma: LOCAL_RADII[kind] }, scale);
export function localPasses(kind: LocalControl, amount: number, scale: number, frame: FilterFrame): FilterPass[] {
  if (!amount) return [];
  const blur = gaussianBlur.passes({ sigma: LOCAL_RADII[kind] }, scale, frame);
  if (!blur.length) return [];
  blur[blur.length - 1]!.save = `${kind}-blurred`;
  const strength = amount / 100;
  const mode = kind === 'clarity' ? 0 : kind === 'texture' ? 1 : 2;
  return [{
    id: 'develop-save', save: `${kind}-original`, uniforms: {},
    glsl: 'vec4 filterPixel(ivec2 p) { return texelFetch(uSource,p,0); }',
    cpu(source, target) { target.data.set(source.data); },
  }, ...blur, {
    id: 'develop-local', inputs: { uOriginal: `${kind}-original`, uBlurred: `${kind}-blurred` }, uniforms: { uStrength: strength, uMode: mode },
    glsl: `uniform sampler2D uOriginal,uBlurred; uniform float uStrength,uMode;
${colourGlsl}
vec4 filterPixel(ivec2 p) {
 vec4 o=texelFetch(uOriginal,p,0), b=texelFetch(uBlurred,p,0);
 if(o.a<=0.0) return vec4(0.0);
 vec3 c=encode(o.rgb/o.a), blurred=b.a>0.0 ? encode(b.rgb/b.a) : c;
 float l=lum(c), base=lum(blurred), detail=l-base;
 float mid=4.0*smoothstep(0.0,1.0,l)*(1.0-smoothstep(0.0,1.0,l));
 if(uMode<0.5) c+=uStrength*detail*mid;
 else if(uMode<1.5) c+=uStrength*detail;
 else { float haze=clamp(min(blurred.r,min(blurred.g,blurred.b)),0.0,0.8); float t=max(0.2,1.0-uStrength*haze*0.7); c=(c-(1.0-t))/t; }
 return vec4(decode(max(c,vec3(0.0)))*o.a,o.a);
}`,
    cpu(source, target, context) {
      const original = context.inputs.uOriginal!, blurred = context.inputs.uBlurred!;
      for (let i=0; i<source.data.length; i+=4) {
        const a=original.data[i+3]!, ba=blurred.data[i+3]!;
        target.data[i+3]=a;
        if(a<=0) { target.data.fill(0,i,i+4); continue; }
        const c=[0,1,2].map(j=>perceptual(original.data[i+j]!/a)) as unknown as Triple;
        const b=[0,1,2].map(j=>ba>0 ? perceptual(blurred.data[i+j]!/ba) : c[j]!) as unknown as Triple;
        const l=luminance(c), detail=l-luminance(b), m=smooth(0,1,l), mid=4*m*(1-m);
        const haze=clamp(Math.min(...b),0,0.8), t=Math.max(0.2,1-strength*haze*0.7);
        for(let j=0;j<3;j++) {
          const value=mode===2 ? (c[j]!-(1-t))/t : c[j]!+strength*detail*(mode===0 ? mid : 1);
          target.data[i+j]=linear(Math.max(0,value))*a;
        }
      }
    },
  }];
}
