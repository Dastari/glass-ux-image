import type { FilterPass, FilterFrame } from '../../core/filter.js';
import type { PixelBuffer } from '../../core/pixels.js';
export type Colour = [
    number,
    number,
    number
];
/** Common strength: 0 is neutral, 1 is full strength. */
export interface AmountParams {
    /** Effect amount; 0 is neutral and 1 is full strength. */
    amount: number;
}
export const clamp = (n: number, low = 0, high = 1) => Math.min(high, Math.max(low, n));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const luma = (c: Colour) => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
export const safe = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
export const strength = (n: number) => clamp(safe(n));
/** Integer-only 32-bit hash, reproduced with uint operations in GLSL. */
export function hash(x: number, y: number, seed = 0): number {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + (seed | 0)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const common = `
uniform vec2 uOrigin;
uniform vec2 uDocument;
uniform float uScale;
uniform float uAmount;
vec4 readAt(ivec2 p) { return texelFetch(uSource, clamp(p, ivec2(0), textureSize(uSource,0)-1),0); }
vec4 sampleAt(vec2 p) {
 ivec2 q=ivec2(floor(p)); vec2 t=fract(p);
 return mix(mix(readAt(q),readAt(q+ivec2(1,0)),t.x),mix(readAt(q+ivec2(0,1)),readAt(q+ivec2(1,1)),t.x),t.y);
}
vec3 straight(vec4 c) { return c.a>0.0 ? c.rgb/c.a : vec3(0); }
float luminance(vec3 c) { return dot(c,vec3(.2126,.7152,.0722)); }
float noiseHash(ivec2 p, uint seed) {
 uint h=uint(p.x)*374761393u+uint(p.y)*668265263u+seed;
 h=(h^(h>>13u))*1274126177u; return float(h^(h>>16u))/4294967296.0;
}`;
export function sample(source: PixelBuffer, x: number, y: number): [
    number,
    number,
    number,
    number
] {
    x = clamp(x, 0, source.width - 1);
    y = clamp(y, 0, source.height - 1);
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const out: [
        number,
        number,
        number,
        number
    ] = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
        const at = (dx: number, dy: number) => source.data[(Math.min(iy + dy, source.height - 1) * source.width + Math.min(ix + dx, source.width - 1)) * 4 + c]!;
        out[c] = mix(mix(at(0, 0), at(1, 0), tx), mix(at(0, 1), at(1, 1), tx), ty);
    }
    return out;
}
export function colour(c: readonly number[]): Colour { return c[3]! > 0 ? [c[0]! / c[3]!, c[1]! / c[3]!, c[2]! / c[3]!] : [0, 0, 0]; }
export const frameUniforms = (frame: FilterFrame, scale: number, amount: number) => ({ uOrigin: [frame.x, frame.y], uDocument: [frame.documentWidth, frame.documentHeight], uScale: scale, uAmount: amount });
/** Point transforms work in straight linear RGB, and restore the source alpha. */
export function pointPass(id: string, frame: FilterFrame, scale: number, amount: number, body: string, transform: (c: Colour, x: number, y: number) => Colour, uniforms: Record<string, number | readonly number[]> = {}, declarations = ''): FilterPass {
    return { id, uniforms: { ...frameUniforms(frame, scale, amount), ...uniforms },
        glsl: `${common}\n${declarations}\nvec4 filterPixel(ivec2 p) { vec4 src=readAt(p); vec3 c=straight(src); vec2 doc=uOrigin+vec2(p)+.5; vec3 result=c; ${body}\nreturn vec4(max(mix(c,result,uAmount),vec3(0))*src.a,src.a); }`,
        cpu(source, target) {
            for (let y = 0; y < source.height; y++)
                for (let x = 0; x < source.width; x++) {
                    const i = (y * source.width + x) * 4, a = source.data[i + 3]!;
                    const c: Colour = a > 0 ? [source.data[i]! / a, source.data[i + 1]! / a, source.data[i + 2]! / a] : [0, 0, 0];
                    const result = transform(c, frame.x + x + .5, frame.y + y + .5);
                    for (let k = 0; k < 3; k++)
                        target.data[i + k] = Math.max(0, mix(c[k]!, result[k]!, amount)) * a;
                    target.data[i + 3] = a;
                }
        }
    };
}
/**
 * The sRGB transfer, used as the perceptual space for tonal decisions: posterise levels, thresholds,
 * contrast curves and luminance differences behave as they do in Photoshop and Lightroom there, not in
 * linear light, where most of a photograph sits in the bottom fifth of the range. Negative light is floored;
 * values above 1 extend the same curve.
 */
export const encode = (v: number) => { v = Math.max(0, v); return v < .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055; };
/** Inverse of `encode`. */
export const decode = (v: number) => { v = Math.max(0, v); return v < .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Smooth value noise in [0, 1) on a document-anchored lattice, reproduced exactly in GLSL. */
export function valueNoise(x: number, y: number, seed: number): number {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return mix(mix(hash(ix, iy, seed), hash(ix + 1, iy, seed), u), mix(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u), v);
}
/** GLSL for `encode`, `decode`, `smoothstep` (built in) and `valueNoise`; include after `common`. */
export const perceptual = `
vec3 encode(vec3 c){c=max(c,vec3(0));return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
vec3 decode(vec3 c){c=max(c,vec3(0));return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
float valueNoise(vec2 q, uint seed){vec2 i=floor(q),f=q-i,u=f*f*(3.0-2.0*f);ivec2 k=ivec2(i);
 return mix(mix(noiseHash(k,seed),noiseHash(k+ivec2(1,0),seed),u.x),mix(noiseHash(k+ivec2(0,1),seed),noiseHash(k+ivec2(1,1),seed),u.x),u.y);}`;
export const encodeColour = (c: Colour): Colour => [encode(c[0]), encode(c[1]), encode(c[2])];
export const decodeColour = (c: Colour): Colour => [decode(c[0]), decode(c[1]), decode(c[2])];
/** Rec. 709 weights applied to perceptual values, as image editors do for "luminosity". */
export const lightness = luma;
/**
 * A point pass that works on perceptual colour `e`: `body` (GLSL) and `transform` (TypeScript) change it,
 * and the result is decoded back to linear light and blended by amount there.
 */
export function tonePass(id: string, frame: FilterFrame, scale: number, amount: number, body: string, transform: (e: Colour, x: number, y: number) => Colour, uniforms: Record<string, number | readonly number[]> = {}, declarations = ''): FilterPass {
    return pointPass(id, frame, scale, amount, `vec3 e=encode(c); ${body}\nresult=decode(e);`, (c, x, y) => decodeColour(transform(encodeColour(c), x, y)), uniforms, `${perceptual}\n${declarations}`);
}
/** A pass that copies its input, to save it for a later pass. */
export const savePass = (name: string): FilterPass => ({ id: 'effects-original', save: name, uniforms: {}, glsl: 'vec4 filterPixel(ivec2 p){return texelFetch(uSource,p,0);}', cpu: (s, t) => t.data.set(s.data) });
