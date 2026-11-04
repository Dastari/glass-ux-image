import { defineFilter, type FilterPass, type FilterFrame } from '../../core/filter.js';
import type { PixelBuffer } from '../../core/pixels.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { kuwaharaPass, type NeighbourhoodParams } from './neighbourhood.js';
import { common, perceptual, frameUniforms, sample, colour, encodeColour, decode, decodeColour, luma, savePass, smoothstep, strength, valueNoise, clamp, type Colour } from './shared.js';
export type { NeighbourhoodParams as ArtisticParams } from './neighbourhood.js';
const blurReach = (sigma: number, s: number) => gaussianBlur.padding({ sigma }, s);
const straightAt = (buffer: PixelBuffer, x: number, y: number) => colour(sample(buffer, x, y));
const lightAt = (buffer: PixelBuffer, x: number, y: number) => luma(encodeColour(straightAt(buffer, x, y)));
/** Write `result(x, y, c)` (linear straight colour) blended with the source by amount, keeping its alpha. */
function finish(original: PixelBuffer, target: PixelBuffer, amount: number, result: (x: number, y: number, c: Colour) => Colour) {
    for (let y = 0; y < original.height; y++)
        for (let x = 0; x < original.width; x++) {
            const i = (y * original.width + x) * 4, a = original.data[i + 3]!, c = colour(original.data.subarray(i, i + 4) as unknown as number[]), r = result(x, y, c);
            for (let k = 0; k < 3; k++) target.data[i + k] = Math.max(0, c[k]! + (r[k]! - c[k]!) * amount) * a;
            target.data[i + 3] = a;
        }
}
const glslFinish = 'return vec4(max(mix(c,decode(e),uAmount),vec3(0))*o.a,o.a);}';
const radiusOf = (p: NeighbourhoodParams, fallback: number) => Math.max(0, p.radius ?? fallback);
type Build = (radius: number, s: number, f: FilterFrame, amount: number) => FilterPass[];
function artistic(id: string, fallback: number, reach: (radius: number, s: number) => number, build: Build) {
    return defineFilter<NeighbourhoodParams>({ id, precision: 'full',
        padding: (p, s) => strength(p.amount) && radiusOf(p, fallback) > 0 ? reach(radiusOf(p, fallback), s) : 0,
        passes(p, s, f) { const amount = strength(p.amount), radius = radiusOf(p, fallback); return amount && radius > 0 ? build(radius, s, f, amount) : []; } });
}
/**
 * Oil paint: a light pre-blur, then a coarse and a fine Kuwahara pass turn texture into flat strokes with
 * crisp edges, as Photoshop's Oil Paint does, and a soft relief lit from the upper left gives the strokes body.
 * amount=0 is neutral; radius is the stroke size in document pixels.
 */
export const oilPainting = /* @__PURE__ */ artistic('oil-painting', 4, (r, s) => blurReach(r * .3, s) + Math.ceil(r * s * 2 + Math.max(.5, r * s * .2)) + 3, (r, s, f, amount) => {
    const step = Math.max(.5, r * s * .2), relief = .7;
    return [savePass('original'), ...gaussianBlur.passes({ sigma: r * .3 }, s, f), kuwaharaPass(r * s * .5), kuwaharaPass(r * s * .35, Math.PI / 4), { id: 'oil-painting', inputs: { uOriginal: 'original' }, uniforms: { ...frameUniforms(f, s, amount), uStep: step, uRelief: relief },
            glsl: `${common}\n${perceptual}\nuniform sampler2D uOriginal; uniform float uStep; uniform float uRelief;
vec4 filterPixel(ivec2 p){vec4 o=texelFetch(uOriginal,p,0);vec3 c=straight(o),e=encode(straight(readAt(p)));
 float a=luminance(encode(straight(sampleAt(vec2(p)-vec2(uStep))))),b=luminance(encode(straight(sampleAt(vec2(p)+vec2(uStep)))));
 float l=luminance(e);e=l+(e-l)*1.12+vec3((a-b)*uRelief*.5);
 ${glslFinish}`,
            cpu(source, target, ctx) {
                finish(ctx.inputs.uOriginal!, target, amount, (x, y) => {
                    const e = encodeColour(straightAt(source, x, y)), l = luma(e), d = (lightAt(source, x - step, y - step) - lightAt(source, x + step, y + step)) * relief * .5;
                    return decodeColour(e.map(v => l + (v - l) * 1.12 + d) as Colour);
                });
            } }];
});
/**
 * Pencil sketch: the classic dodge of a grey picture by its own blur, so flat areas go to paper white and
 * lines form along edges, deepened and laid over a soft graphite shading of the darker areas.
 * amount=0 is neutral; radius is the line reach in document pixels.
 */
export const pencilSketch = /* @__PURE__ */ artistic('pencil-sketch', 2, (r, s) => blurReach(r, s) + 1, (r, s, f, amount) => {
    const depth = 3, shade = .35;
    return [savePass('original'), ...gaussianBlur.passes({ sigma: r }, s, f), { id: 'pencil-sketch', inputs: { uOriginal: 'original' }, uniforms: { ...frameUniforms(f, s, amount), uDepth: depth, uShade: shade },
            glsl: `${common}\n${perceptual}\nuniform sampler2D uOriginal; uniform float uDepth; uniform float uShade;
vec4 filterPixel(ivec2 p){vec4 o=texelFetch(uOriginal,p,0);vec3 c=straight(o);
 float l=luminance(encode(c)),b=luminance(encode(straight(readAt(p))));
 float line=pow(clamp(l/max(b,.02),0.0,1.0),uDepth);float tone=1.0-uShade*(1.0-smoothstep(0.0,.5,l));
 vec3 e=vec3(line*tone);
 ${glslFinish}`,
            cpu(source, target, ctx) {
                finish(ctx.inputs.uOriginal!, target, amount, (x, y, c) => {
                    const l = luma(encodeColour(c)), b = lightAt(source, x, y), line = clamp(l / Math.max(b, .02)) ** depth, g = decode(line * (1 - shade * (1 - smoothstep(0, .5, l))));
                    return [g, g, g];
                });
            } }];
});
/**
 * Watercolour: blurred, Kuwahara-flattened washes, lightened as transparent pigment over white paper,
 * darkened where washes meet (pigment pools at their edges) and granulated by a document-anchored paper grain.
 * amount=0 is neutral; radius is the wash size in document pixels.
 */
export const watercolour = /* @__PURE__ */ artistic('watercolour', 5, (r, s) => blurReach(r * .5, s) + Math.ceil(r * s) + Math.ceil(r * s * .5) + 3, (r, s, f, amount) => {
    const step = Math.max(.5, r * s * .5), cell = Math.max(1, r * s * 1.5);
    return [savePass('original'), ...gaussianBlur.passes({ sigma: r * .5 }, s, f), kuwaharaPass(r * s * .5), { id: 'watercolour', inputs: { uOriginal: 'original' }, uniforms: { ...frameUniforms(f, s, amount), uStep: step, uCell: cell },
            glsl: `${common}\n${perceptual}\nuniform sampler2D uOriginal; uniform float uStep; uniform float uCell;
float lightAt(vec2 q){return luminance(encode(straight(sampleAt(q))));}
vec4 filterPixel(ivec2 p){vec4 o=texelFetch(uOriginal,p,0);vec3 c=straight(o),w=encode(straight(readAt(p)));
 float gx=lightAt(vec2(p)+vec2(uStep,0))-lightAt(vec2(p)-vec2(uStep,0)),gy=lightAt(vec2(p)+vec2(0,uStep))-lightAt(vec2(p)-vec2(0,uStep));
 vec2 doc=uOrigin+vec2(p)+.5;float n=valueNoise(doc/uCell,3u)*.6+valueNoise(doc/(uCell*.37),5u)*.4;
 float l=luminance(w);w=l+(w-l)*1.25;vec3 e=1.0-(1.0-clamp(w,0.0,1.0))*.92;
 e*=(1.0-clamp(length(vec2(gx,gy))*.8,0.0,.22))*(1.0+(n-.5)*.08);
 ${glslFinish}`,
            cpu(source, target, ctx) {
                finish(ctx.inputs.uOriginal!, target, amount, (x, y) => {
                    const gx = lightAt(source, x + step, y) - lightAt(source, x - step, y), gy = lightAt(source, x, y + step) - lightAt(source, x, y - step);
                    const dx = f.x + x + .5, dy = f.y + y + .5, n = valueNoise(dx / cell, dy / cell, 3) * .6 + valueNoise(dx / (cell * .37), dy / (cell * .37), 5) * .4;
                    const w = encodeColour(straightAt(source, x, y)), l = luma(w), k = (1 - clamp(Math.hypot(gx, gy) * .8, 0, .22)) * (1 + (n - .5) * .08);
                    return decodeColour(w.map(v => (1 - (1 - clamp(l + (v - l) * 1.25)) * .92) * k) as Colour);
                });
            } }];
});
/**
 * Cartoon: Kuwahara-flattened colour whose lightness falls into soft-edged bands with its hue kept, and dark
 * outlines from a difference of Gaussians on the flattened picture, drawn on the darker side of each edge.
 * amount=0 is neutral; radius is the detail size in document pixels.
 */
export const cartoon = /* @__PURE__ */ artistic('cartoon', 3, (r, s) => blurReach(r * .35, s) + Math.ceil(r * s) + 1 + blurReach(r * .6, s) + blurReach(r * .6 * Math.sqrt(3), s), (r, s, f, amount) => {
    const bands = 5, edge = .02, near = r * .6;
    return [savePass('original'), ...gaussianBlur.passes({ sigma: r * .35 }, s, f), kuwaharaPass(r * s * .5), savePass('paint'), ...gaussianBlur.passes({ sigma: near }, s, f), savePass('near'), ...gaussianBlur.passes({ sigma: near * Math.sqrt(3) }, s, f), { id: 'cartoon', inputs: { uOriginal: 'original', uPaint: 'paint', uNear: 'near' }, uniforms: { ...frameUniforms(f, s, amount), uBands: bands, uEdge: edge },
            glsl: `${common}\n${perceptual}\nuniform sampler2D uOriginal; uniform sampler2D uPaint; uniform sampler2D uNear; uniform float uBands; uniform float uEdge;
vec4 filterPixel(ivec2 p){vec4 o=texelFetch(uOriginal,p,0);vec3 c=straight(o),e=encode(straight(texelFetch(uPaint,p,0)));
 float l=luminance(e),x=clamp(l,0.0,1.0)*uBands,q=(floor(x)+smoothstep(.4,.6,fract(x)))/uBands;
 e=min(e*(q/max(l,.001)),vec3(1));float m=luminance(e);e=max(m+(e-m)*1.2,vec3(0));
 float d=luminance(encode(straight(readAt(p))))-luminance(encode(straight(texelFetch(uNear,p,0))));
 e*=1.0-.9*smoothstep(uEdge,uEdge*3.0,d);
 ${glslFinish}`,
            cpu(source, target, ctx) {
                const paint = ctx.inputs.uPaint!, nearby = ctx.inputs.uNear!;
                finish(ctx.inputs.uOriginal!, target, amount, (x, y) => {
                    const i = (y * paint.width + x) * 4, e = encodeColour(colour(paint.data.subarray(i, i + 4) as unknown as number[])), l = luma(e), t = clamp(l) * bands, q = (Math.floor(t) + smoothstep(.4, .6, t - Math.floor(t))) / bands;
                    const g = e.map(v => Math.min(1, v * (q / Math.max(l, .001)))) as Colour, m = luma(g);
                    const d = luma(encodeColour(colour(source.data.subarray(i, i + 4) as unknown as number[]))) - luma(encodeColour(colour(nearby.data.subarray(i, i + 4) as unknown as number[]))), k = 1 - .9 * smoothstep(edge, edge * 3, d);
                    return decodeColour(g.map(v => Math.max(0, m + (v - m) * 1.2) * k) as Colour);
                });
            } }];
});
