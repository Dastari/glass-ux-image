import { defineFilter, type DataTexture } from '../../core/filter.js';
import { pointPass, clamp, strength, mix, type AmountParams, type Colour } from './shared.js';
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
