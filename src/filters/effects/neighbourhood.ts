import { defineFilter, type FilterPass } from '../../core/filter.js';
import { common, perceptual, frameUniforms, sample, colour, decode, encodeColour, luma, strength, type AmountParams } from './shared.js';
/** amount=0 is neutral. Radius is in document pixels, bounded to a 5×5 sampling grid. */
export interface NeighbourhoodParams extends AmountParams {
    /** Sampling radius in document pixels. */
    radius?: number;
    /** Bilateral tolerance in perceptual (sRGB-encoded) colour distance, default .1. */
    tolerance?: number;
}
/** Smooth quadrant weights: the flattest quadrant wins without a hard switch between neighbours. */
const QUADRANT_SHARPNESS = 2000;
/**
 * A generalised Kuwahara pass over a 5×5 grid `spacing` level pixels apart, turned by `turn` radians: the four overlapping 3×3
 * quadrants each give a perceptual mean and variance, and flatter quadrants weigh more. Edges stay sharp
 * while areas flatten into strokes, the basis of painted looks. Keeps the source alpha.
 */
export function kuwaharaPass(spacing: number, turn = 0): FilterPass {
    const cos = Math.cos(turn) * spacing, sin = Math.sin(turn) * spacing;
    return { id: 'effects-kuwahara', uniforms: { uAxes: [cos, sin, -sin, cos], uSharpness: QUADRANT_SHARPNESS },
        glsl: `${common}\n${perceptual}\nuniform vec4 uAxes; uniform float uSharpness;
vec4 filterPixel(ivec2 p){vec4 src=readAt(p);vec3 m[4];vec3 s[4];float n[4];
 for(int k=0;k<4;k++){m[k]=vec3(0);s[k]=vec3(0);n[k]=0.0;}
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec4 v=sampleAt(vec2(p)+float(x)*uAxes.xy+float(y)*uAxes.zw);vec3 q=encode(straight(v));float a=v.a;
  if(x<=0&&y<=0){m[0]+=q*a;s[0]+=q*q*a;n[0]+=a;} if(x>=0&&y<=0){m[1]+=q*a;s[1]+=q*q*a;n[1]+=a;}
  if(x<=0&&y>=0){m[2]+=q*a;s[2]+=q*q*a;n[2]+=a;} if(x>=0&&y>=0){m[3]+=q*a;s[3]+=q*q*a;n[3]+=a;}}
 vec3 sum=vec3(0);float total=0.0;
 for(int k=0;k<4;k++){if(n[k]>0.0){vec3 mean=m[k]/n[k];vec3 d=max(s[k]/n[k]-mean*mean,vec3(0));float w=1.0/(1.0+(d.r+d.g+d.b)*uSharpness);w*=w;w*=w;sum+=mean*w;total+=w;}}
 vec3 e=total>0.0?sum/total:encode(straight(src));return vec4(decode(e)*src.a,src.a);}`,
        cpu(source, target) {
            const m = [0, 0, 0, 0].map(() => [0, 0, 0]), s = [0, 0, 0, 0].map(() => [0, 0, 0]), n = [0, 0, 0, 0];
            for (let y = 0; y < source.height; y++)
                for (let x = 0; x < source.width; x++) {
                    for (let k = 0; k < 4; k++) { m[k]!.fill(0); s[k]!.fill(0); n[k] = 0; }
                    for (let dy = -2; dy <= 2; dy++)
                        for (let dx = -2; dx <= 2; dx++) {
                            const v = sample(source, x + dx * cos - dy * sin, y + dx * sin + dy * cos), q = encodeColour(colour(v)), a = v[3];
                            for (let k = 0; k < 4; k++) {
                                if ((k & 1 ? dx >= 0 : dx <= 0) && (k & 2 ? dy >= 0 : dy <= 0)) {
                                    for (let c = 0; c < 3; c++) { m[k]![c]! += q[c]! * a; s[k]![c]! += q[c]! * q[c]! * a; }
                                    n[k]! += a;
                                }
                            }
                        }
                    const sum = [0, 0, 0];
                    let total = 0;
                    for (let k = 0; k < 4; k++) {
                        if (!(n[k]! > 0)) continue;
                        let d = 0;
                        const mean = m[k]!.map(v => v / n[k]!);
                        for (let c = 0; c < 3; c++) d += Math.max(0, s[k]![c]! / n[k]! - mean[c]! * mean[c]!);
                        let w = 1 / (1 + d * QUADRANT_SHARPNESS); w *= w; w *= w;
                        for (let c = 0; c < 3; c++) sum[c]! += mean[c]! * w;
                        total += w;
                    }
                    const i = (y * source.width + x) * 4, a = source.data[i + 3]!, own = encodeColour(colour(source.data.subarray(i, i + 4) as unknown as number[]));
                    for (let c = 0; c < 3; c++) target.data[i + c] = decode(total > 0 ? sum[c]! / total : own[c]!) * a;
                    target.data[i + 3] = a;
                }
        } };
}
/**
 * Edge-preserving denoising: a 5×5 bilateral grid whose range weight compares perceptual colour, so shadow
 * noise is smoothed as much as highlight noise, and whose spatial weight is Gaussian over the radius.
 */
function bilateral(id: string, fallbackRadius: number) {
    return defineFilter<NeighbourhoodParams>({ id, padding: (p, s) => strength(p.amount) ? Math.ceil(Math.max(0, p.radius ?? fallbackRadius) * s) + 1 : 0,
        passes(p, s, f) {
            const amount = strength(p.amount), radius = Math.max(0, p.radius ?? fallbackRadius) * s, tolerance = Math.max(.001, p.tolerance ?? .1);
            if (!amount)
                return [];
            return [{ id: 'effects-bilateral', uniforms: { ...frameUniforms(f, s, amount), uRadius: radius, uTolerance: tolerance },
                    glsl: `${common}\n${perceptual}\nuniform float uRadius; uniform float uTolerance;
vec4 filterPixel(ivec2 p){vec4 src=readAt(p);vec3 c=encode(straight(src)),sum=vec3(0);float total=0.0;
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec4 v=sampleAt(vec2(p)+vec2(x,y)*uRadius*.5);vec3 q=encode(straight(v));
  float w=exp(-dot(q-c,q-c)/(uTolerance*uTolerance)-float(x*x+y*y)*.25)*v.a;sum+=q*w;total+=w;}
 vec3 e=total>0.0?sum/total:c;vec3 l=straight(src);return vec4(max(mix(l,decode(e),uAmount),vec3(0))*src.a,src.a);}`,
                    cpu(source, target) {
                        for (let y = 0; y < source.height; y++)
                            for (let x = 0; x < source.width; x++) {
                                const i = (y * source.width + x) * 4, a = source.data[i + 3]!, l = colour(source.data.subarray(i, i + 4) as unknown as number[]), c = encodeColour(l), sum = [0, 0, 0];
                                let total = 0;
                                for (let dy = -2; dy <= 2; dy++)
                                    for (let dx = -2; dx <= 2; dx++) {
                                        const v = sample(source, x + dx * radius * .5, y + dy * radius * .5), q = encodeColour(colour(v));
                                        const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2, w = Math.exp(-d / (tolerance * tolerance) - (dx * dx + dy * dy) * .25) * v[3];
                                        for (let k = 0; k < 3; k++) sum[k]! += q[k]! * w;
                                        total += w;
                                    }
                                for (let k = 0; k < 3; k++) target.data[i + k] = Math.max(0, l[k]! + (decode(total > 0 ? sum[k]! / total : c[k]!) - l[k]!) * amount) * a;
                                target.data[i + 3] = a;
                            }
                    }
                }];
        }
    });
}
/** amount=0 is neutral; bilateral colour-distance denoising. */
export const reduceNoise = /* @__PURE__ */ bilateral('reduce-noise', 2);
/** amount=0 is neutral; broader bilateral smoothing for film grain. */
export const removeGrain = /* @__PURE__ */ bilateral('remove-grain', 3);
/** Relief gain: a perceptual step of 0.25 across the radius reads as a full shadow or highlight. */
const EMBOSS_GAIN = 2;
/**
 * Grey relief lit from the upper left, as Photoshop's Emboss draws it at 135°: the perceptual luminance
 * difference across `radius` document pixels raises or sinks each edge around a mid-grey plate.
 */
export const emboss = /* @__PURE__ */ defineFilter<NeighbourhoodParams>({ id: 'emboss', padding: (p, s) => strength(p.amount) ? Math.ceil(Math.max(0, p.radius ?? 2) * s) + 2 : 0,
    passes(p, s, f) {
        const amount = strength(p.amount), radius = Math.max(.5, Math.max(0, p.radius ?? 2) * s);
        if (!amount)
            return [];
        return [{ id: 'emboss', uniforms: { ...frameUniforms(f, s, amount), uRadius: radius, uGain: EMBOSS_GAIN },
                glsl: `${common}\n${perceptual}\nuniform float uRadius; uniform float uGain;
float lightAt(vec2 q){return luminance(encode(straight(sampleAt(q))));}
vec4 filterPixel(ivec2 p){vec4 src=readAt(p);vec2 o=vec2(uRadius)*.7071;
 float r=clamp(.5+(lightAt(vec2(p)-o)-lightAt(vec2(p)+o))*uGain*.5+(lightAt(vec2(p)-o*.5)-lightAt(vec2(p)+o*.5))*uGain*.5,0.0,1.0);
 vec3 c=straight(src);return vec4(max(mix(c,decode(vec3(r)),uAmount),vec3(0))*src.a,src.a);}`,
                cpu(source, target) {
                    const o = radius * Math.SQRT1_2, at = (x: number, y: number) => luma(encodeColour(colour(sample(source, x, y))));
                    for (let y = 0; y < source.height; y++)
                        for (let x = 0; x < source.width; x++) {
                            const i = (y * source.width + x) * 4, a = source.data[i + 3]!, c = colour(source.data.subarray(i, i + 4) as unknown as number[]);
                            const r = Math.min(1, Math.max(0, .5 + (at(x - o, y - o) - at(x + o, y + o)) * EMBOSS_GAIN * .5 + (at(x - o * .5, y - o * .5) - at(x + o * .5, y + o * .5)) * EMBOSS_GAIN * .5)), g = decode(r);
                            for (let k = 0; k < 3; k++) target.data[i + k] = Math.max(0, c[k]! + (g - c[k]!) * amount) * a;
                            target.data[i + 3] = a;
                        }
                }
            }];
    } });
