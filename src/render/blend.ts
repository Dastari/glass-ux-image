import type { BlendMode, PixelBuffer } from "../core/index.js";
type RGB = [number, number, number];
const lum = (c: RGB) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
const sat = (c: RGB) => Math.max(...c) - Math.min(...c);
function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  let v = c.map(x => x + d) as RGB;
  const n = Math.min(...v), x = Math.max(...v);
  if (n < 0) v = v.map(c => l + (c - l) * l / (l - n)) as RGB;
  if (x > 1) v = v.map(c => l + (c - l) * (1 - l) / (x - l)) as RGB;
  return v;
}
function setSat(c: RGB, s: number): RGB {
  const n = Math.min(...c), d = sat(c);
  return c.map(x => d ? (x - n) * s / d : 0) as RGB;
}
/** W3C compositing blend functions in linear light. Matches blendGlsl. */
export function blendColour(d: RGB, s: RGB, mode: BlendMode): RGB {
  if (mode === "hue") return setLum(setSat(s, sat(d)), lum(d));
  if (mode === "saturation") return setLum(setSat(d, sat(s)), lum(d));
  if (mode === "colour") return setLum(s, lum(d));
  if (mode === "luminosity") return setLum(d, lum(s));
  return d.map((b, i) => {
    const a = s[i]!;
    switch (mode) {
      case "multiply": return a * b;
      case "screen": return a + b - a * b;
      case "overlay": return b <= .5 ? 2*a*b : 1-2*(1-a)*(1-b);
      case "hard-light": return a <= .5 ? 2*a*b : 1-2*(1-a)*(1-b);
      case "soft-light": return a <= .5 ? b-(1-2*a)*b*(1-b) : b+(2*a-1)*((b <= .25 ? ((16*b-12)*b+4)*b : Math.sqrt(b))-b);
      case "darken": return Math.min(a,b);
      case "lighten": return Math.max(a,b);
      case "difference": return Math.abs(b-a);
      case "exclusion": return a+b-2*a*b;
      case "colour-dodge": return b === 0 ? 0 : a >= 1 ? 1 : Math.min(1,b/(1-a));
      case "colour-burn": return b >= 1 ? 1 : a === 0 ? 0 : 1-Math.min(1,(1-b)/a);
      default: return a;
    }
  }) as RGB;
}
/** Lay top over base in place, both premultiplied linear RGBA. */
export function blendPixels(base: PixelBuffer, top: PixelBuffer, offsetX: number, offsetY: number, mode: BlendMode, opacity: number) {
  const d = base.data, s = top.data;
  for (let y=0;y<base.height;y++) for(let x=0;x<base.width;x++) {
    const i=(y*base.width+x)*4, j=((y+offsetY)*top.width+x+offsetX)*4;
    const sa=s[j+3]!*opacity, da=d[i+3]!;
    const dc: RGB=[d[i]!,d[i+1]!,d[i+2]!], sc: RGB=[s[j]!*opacity,s[j+1]!*opacity,s[j+2]!*opacity];
    const b=blendColour(dc.map(v=>da ? v/da : 0) as RGB,sc.map(v=>sa ? v/sa : 0) as RGB,mode);
    for(let c=0;c<3;c++) d[i+c]=sc[c]!*(1-da)+dc[c]!*(1-sa)+sa*da*b[c]!;
    d[i+3]=sa+da*(1-sa);
  }
}
export const blendGlsl = /* glsl */ `
float lum(vec3 c) { return dot(c, vec3(.3,.59,.11)); }
float sat(vec3 c) { return max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b); }
vec3 setLum(vec3 c,float l) {
 c+=l-lum(c); float n=min(min(c.r,c.g),c.b), x=max(max(c.r,c.g),c.b);
 if(n<0.) c=l+(c-l)*l/(l-n);
 if(x>1.) c=l+(c-l)*(1.-l)/(x-l);
 return c;
}
vec3 setSat(vec3 c,float s) { float n=min(min(c.r,c.g),c.b), d=sat(c); return d>0. ? (c-n)*s/d : vec3(0); }
float channel(float b,float a,int m) {
 if(m==1) return a*b;
 if(m==2) return a+b-a*b;
 if(m==3) return b<=.5 ? 2.*a*b : 1.-2.*(1.-a)*(1.-b);
 if(m==4) return a<=.5 ? b-(1.-2.*a)*b*(1.-b) : b+(2.*a-1.)*((b<=.25 ? ((16.*b-12.)*b+4.)*b : sqrt(b))-b);
 if(m==5) return a<=.5 ? 2.*a*b : 1.-2.*(1.-a)*(1.-b);
 if(m==6) return min(a,b);
 if(m==7) return max(a,b);
 if(m==8) return abs(b-a);
 if(m==9) return a+b-2.*a*b;
 if(m==10) return b==0. ? 0. : a>=1. ? 1. : min(1.,b/(1.-a));
 if(m==11) return b>=1. ? 1. : a==0. ? 0. : 1.-min(1.,(1.-b)/a);
 return a;
}
vec3 blendColour(vec3 b,vec3 a,int m) {
 if(m==12) return setLum(setSat(a,sat(b)),lum(b));
 if(m==13) return setLum(setSat(b,sat(a)),lum(b));
 if(m==14) return setLum(a,lum(b));
 if(m==15) return setLum(b,lum(a));
 return vec3(channel(b.r,a.r,m),channel(b.g,a.g,m),channel(b.b,a.b,m));
}`;
