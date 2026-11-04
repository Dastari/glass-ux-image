import { defineFilter, type DataTexture } from '../../core/filter.js';
import { pointPass, perceptual, encode, decode, smoothstep, clamp, strength, mix, type AmountParams, type Colour } from './shared.js';
/** Plain-data linear RGB LUT; red varies fastest, then green, then blue. Values and domains are linear. */
export interface Lut3D {
    /** Cube edge from 2 to 64 samples. */
    size: number;
    /** Red-fastest linear RGB sample triples. */
    values: number[];
    /** Linear RGB input-domain minimum, default [0, 0, 0]. */
    domainMin?: Colour;
    /** Linear RGB input-domain maximum, default [1, 1, 1]. */
    domainMax?: Colour;
    /** Optional host-provided LUT title. */
    title?: string;
}
/** amount=0 or lut=null is neutral. No implicit transfer-function conversion is performed. */
export interface GradingParams extends AmountParams {
    /** Linear RGB table; null disables grading. */
    lut: Lut3D | null;
}
/** Validate 3D LUT dimensions, domain and finite sample values before rendering. */
export function validateLut(lut: Lut3D): void {
    if (!Number.isInteger(lut.size) || lut.size < 2 || lut.size > 64)
        throw new RangeError('LUT size must be an integer from 2 to 64');
    if (lut.values.length !== lut.size ** 3 * 3 || !lut.values.every(Number.isFinite))
        throw new RangeError('Invalid LUT samples');
    const lo = lut.domainMin ?? [0, 0, 0], hi = lut.domainMax ?? [1, 1, 1];
    if (lo.length !== 3 || hi.length !== 3 || !lo.every((v, k) => Number.isFinite(v) && Number.isFinite(hi[k]) && hi[k]! > v))
        throw new RangeError('Invalid LUT domain');
}
/** 2D atlas: x=red+blue*size, y=green. Maximum width 4096, within WebGL2 minimum limits. */
export function lutAtlas(lut: Lut3D): DataTexture {
    validateLut(lut);
    const n = lut.size, data = new Float32Array(n ** 3 * 4);
    for (let b = 0; b < n; b++)
        for (let g = 0; g < n; g++)
            for (let r = 0; r < n; r++) {
                const input = ((b * n + g) * n + r) * 3, output = (g * n * n + b * n + r) * 4;
                for (let k = 0; k < 3; k++)
                    data[output + k] = lut.values[input + k]!;
                data[output + 3] = 1;
            }
    return { width: n * n, height: n, data };
}
/** Trilinear interpolation, with domain and sample-coordinate clamping identical to GLSL. */
export function lookupLut(lut: Lut3D, c: Colour): Colour {
    const n = lut.size, lo = lut.domainMin ?? [0, 0, 0], hi = lut.domainMax ?? [1, 1, 1], q = c.map((v, k) => clamp((v - lo[k]!) / (hi[k]! - lo[k]!)) * (n - 1)), base = q.map(Math.floor), t = q.map((v, k) => v - base[k]!);
    const fetch = (r: number, g: number, b: number, k: number) => Math.fround(lut.values[((Math.min(n - 1, b) * n + Math.min(n - 1, g)) * n + Math.min(n - 1, r)) * 3 + k]!);
    return [0, 1, 2].map(k => { const plane = (b: number) => mix(mix(fetch(base[0]!, base[1]!, b, k), fetch(base[0]! + 1, base[1]!, b, k), t[0]!), mix(fetch(base[0]!, base[1]! + 1, b, k), fetch(base[0]! + 1, base[1]! + 1, b, k), t[0]!), t[1]!); return mix(plane(base[2]!), plane(base[2]! + 1), t[2]!); }) as Colour;
}
/** Trilinear 3D LUT grading over linear RGB; a null LUT is neutral. */
export const lutGrading = /* @__PURE__ */ defineFilter<GradingParams>({ id: 'lut-grading', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount), lut = p.lut;
        if (!a || !lut)
            return [];
        const atlas = lutAtlas(lut);
        const pass = pointPass('lut-grading', f, s, a, 'result=lookup(c);', c => lookupLut(lut, c), { uLutSize: lut.size, uDomainMin: lut.domainMin ?? [0, 0, 0], uDomainMax: lut.domainMax ?? [1, 1, 1] }, `
 uniform sampler2D uLut;uniform float uLutSize;uniform vec3 uDomainMin;uniform vec3 uDomainMax;
 vec3 lutAt(ivec3 p){int n=int(uLutSize);p=clamp(p,ivec3(0),ivec3(n-1));return texelFetch(uLut,ivec2(p.x+p.z*n,p.y),0).rgb;}
 vec3 lookup(vec3 c){vec3 q=clamp((c-uDomainMin)/(uDomainMax-uDomainMin),0.0,1.0)*(uLutSize-1.0);ivec3 p=ivec3(floor(q));vec3 t=fract(q);
 return mix(mix(mix(lutAt(p),lutAt(p+ivec3(1,0,0)),t.x),mix(lutAt(p+ivec3(0,1,0)),lutAt(p+ivec3(1,1,0)),t.x),t.y),mix(mix(lutAt(p+ivec3(0,0,1)),lutAt(p+ivec3(1,0,1)),t.x),mix(lutAt(p+ivec3(0,1,1)),lutAt(p+ivec3(1,1,1)),t.x),t.y),t.z);}`);
        pass.textures = { uLut: atlas };
        // Read the bound texture, so CPU and GPU use the same immutable float32 samples.
        pass.cpu = (source, target, context) => {
            const data = context.textures.uLut!;
            const values: number[] = [];
            for (let b = 0; b < lut.size; b++)
                for (let g = 0; g < lut.size; g++)
                    for (let r = 0; r < lut.size; r++) {
                        const i = (g * data.width + b * lut.size + r) * 4;
                        values.push(data.data[i]!, data.data[i + 1]!, data.data[i + 2]!);
                    }
            const bound = { ...lut, values };
            for (let i = 0; i < source.data.length; i += 4) {
                const alpha = source.data[i + 3]!, c: Colour = alpha > 0 ? [source.data[i]! / alpha, source.data[i + 1]! / alpha, source.data[i + 2]! / alpha] : [0, 0, 0], result = lookupLut(bound, c);
                for (let k = 0; k < 3; k++)
                    target.data[i + k] = Math.max(0, mix(c[k]!, result[k]!, a)) * alpha;
                target.data[i + 3] = alpha;
            }
        };
        return [pass];
    } });
/** Generate a serialisable LUT instead of shipping binary assets. */
export function generateLut(size: number, transform: (c: Colour) => Colour): Lut3D {
    if (!Number.isInteger(size) || size < 2 || size > 64)
        throw new RangeError('Invalid LUT size');
    const values: number[] = [];
    for (let b = 0; b < size; b++)
        for (let g = 0; g < size; g++)
            for (let r = 0; r < size; r++)
                values.push(...transform([r / (size - 1), g / (size - 1), b / (size - 1)]));
    const lut = { size, values };
    validateLut(lut);
    return lut;
}
/** amount=0 is neutral. A colour grade in plain numbers; every field defaults to no change. */
export interface ColourGradeParams extends AmountParams {
    /** -1…1: white balance towards amber (positive) or blue. */
    warmth?: number;
    /** -1…1: towards magenta (positive) or green. */
    tint?: number;
    /** 0…1: mix to black and white, using `mix`. */
    mono?: number;
    /** Linear channel weights for black and white, normalised; default Rec. 709 luminance. */
    mix?: Colour;
    /** -1…1: an S-curve on each perceptual channel about mid grey (positive), or a flattening one. */
    contrast?: number;
    /** -1…1: saturation about perceptual luminance. */
    saturation?: number;
    /** Perceptual offsets added to the shadows (split toning), about ±0.1 for a visible tone. */
    shadows?: Colour;
    /** Perceptual offsets added to the highlights. */
    highlights?: Colour;
    /** 0…1: lift blacks and dim whites, as a matte tone curve does. */
    fade?: number;
}
const grade3 = (c: readonly number[] | undefined): Colour => [c?.[0] ?? 0, c?.[1] ?? 0, c?.[2] ?? 0];
/**
 * A parametric colour grade, as Lightroom's white balance, tone curve, saturation, split toning and black and
 * white mix combine: white balance and the mono mix act on linear light; contrast, saturation, toning and fade
 * on perceptual values. One point pass; looks are built from it.
 */
export const colourGrade = /* @__PURE__ */ defineFilter<ColourGradeParams>({ id: 'colour-grade', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount);
        if (!a)
            return [];
        const warmth = clamp(p.warmth ?? 0, -1, 1), tint = clamp(p.tint ?? 0, -1, 1), mono = clamp(p.mono ?? 0), contrast = clamp(p.contrast ?? 0, -1, 1), saturation = clamp(p.saturation ?? 0, -1, 1), fade = clamp(p.fade ?? 0);
        const weights = grade3(p.mix ?? [.2126, .7152, .0722]), total = weights[0] + weights[1] + weights[2], mixWeights = (total > 0 ? weights.map(w => w / total) : [.2126, .7152, .0722]) as Colour;
        const gains: Colour = [(1 + .12 * warmth) * (1 + .05 * tint), 1 - .1 * tint, (1 - .12 * warmth) * (1 + .05 * tint)], shadows = grade3(p.shadows), highlights = grade3(p.highlights);
        const lum = (e: Colour) => e[0] * .2126 + e[1] * .7152 + e[2] * .0722;
        const sstep = (x: number) => x * x * (3 - 2 * x);
        return [pointPass('colour-grade', f, s, a, `vec3 l=c*uGains;l=mix(l,vec3(dot(l,uMix)),uMono);vec3 e=encode(l);
 vec3 x=clamp(e,0.0,1.0);e+=uContrast*(x*x*(3.0-2.0*x)-x);float y=luminance(e);e=y+(e-y)*(1.0+uSaturation);
 y=clamp(luminance(e),0.0,1.0);e+=uShadows*(1.0-smoothstep(0.0,.6,y))+uHighlights*smoothstep(.4,1.0,y);
 e=e*(1.0-.32*uFade)+.24*uFade;result=decode(e);`, c => {
            let l = c.map((v, k) => v * gains[k]!) as Colour;
            const m = l[0] * mixWeights[0] + l[1] * mixWeights[1] + l[2] * mixWeights[2];
            l = l.map(v => v + (m - v) * mono) as Colour;
            let e = l.map(v => { const x = clamp(encode(v)); return encode(v) + contrast * (sstep(x) - x); }) as Colour;
            let y = lum(e);
            e = e.map(v => y + (v - y) * (1 + saturation)) as Colour;
            y = clamp(lum(e));
            const ws = 1 - smoothstep(0, .6, y), wh = smoothstep(.4, 1, y);
            return e.map((v, k) => decode((v + shadows[k]! * ws + highlights[k]! * wh) * (1 - .32 * fade) + .24 * fade)) as Colour;
        }, { uGains: gains, uMix: mixWeights, uMono: mono, uContrast: contrast, uSaturation: saturation, uShadows: shadows, uHighlights: highlights, uFade: fade }, `${perceptual}\nuniform vec3 uGains;uniform vec3 uMix;uniform float uMono;uniform float uContrast;uniform float uSaturation;uniform vec3 uShadows;uniform vec3 uHighlights;uniform float uFade;`)];
    } });
