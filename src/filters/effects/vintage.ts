import { defineFilter } from '../../core/filter.js';
import { tonePass, strength, luma, valueNoise, type AmountParams, type Colour } from './shared.js';
/**
 * amount=0 is neutral. The sepia matrix of CSS and most photo apps, applied to perceptual (sRGB-encoded)
 * colour as they apply it, and clipped at white.
 */
export const sepia = /* @__PURE__ */ defineFilter<AmountParams>({ id: 'sepia', padding: () => 0, passes(p, s, f) { const a = strength(p.amount); return a ? [tonePass('sepia', f, s, a, 'e=min(vec3(dot(e,vec3(.393,.769,.189)),dot(e,vec3(.349,.686,.168)),dot(e,vec3(.272,.534,.131))),vec3(1));', e => [Math.min(1, e[0] * .393 + e[1] * .769 + e[2] * .189), Math.min(1, e[0] * .349 + e[1] * .686 + e[2] * .168), Math.min(1, e[0] * .272 + e[1] * .534 + e[2] * .131)])] : []; } });
/**
 * amount=0 is neutral. A faded print: blacks lift to a soft charcoal, whites dim a little and colour loses a
 * fifth of its saturation, as a matte tone curve and a saturation cut do in Lightroom.
 */
export const faded = /* @__PURE__ */ defineFilter<AmountParams>({ id: 'faded', padding: () => 0, passes(p, s, f) { const a = strength(p.amount); return a ? [tonePass('faded', f, s, a, 'float l=luminance(e);e=(l+(e-l)*.8)*.82+.11;', e => { const l = luma(e); return e.map(v => (l + (v - l) * .8) * .82 + .11) as Colour; })] : []; } });
/** Grain cells have document-pixel size; amount=0 is neutral; seed is a signed 32-bit integer. */
export interface GrainParams extends AmountParams {
    /** Deterministic signed 32-bit noise seed, default 0. */
    seed?: number;
    /** Cell edge in document pixels. */
    size?: number;
}
/** Peak perceptual grain in the midtones at full strength. */
const GRAIN = .16;
/**
 * Seeded monochrome film grain: two octaves of smooth, document-anchored noise in perceptual space, strongest
 * in the midtones and fading towards black and white, as Lightroom's grain does. Cells smaller than a pixel
 * of the level being drawn average out, so zoomed-out views and thumbnails show the grain as it really reads.
 */
export const filmGrain = /* @__PURE__ */ defineFilter<GrainParams>({ id: 'film-grain', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount), size = Math.max(1, p.size ?? 1), seed = (p.seed ?? 0) | 0, scaled = s * size, gain = GRAIN * Math.min(1, scaled);
        return a ? [tonePass('film-grain', f, s, a, 'uint sd=uint(uSeed.x)|(uint(uSeed.y)<<16u);vec2 q=doc/uCell;float n=(valueNoise(q,sd)-.5)*1.4+(valueNoise(q*2.03+17.0,sd+1u)-.5)*.6;float l=clamp(luminance(e),0.0,1.0);e+=vec3(n*uGain*(1.0-.7*(2.0*l-1.0)*(2.0*l-1.0)));', (e, x, y) => {
                const qx = x / scaled, qy = y / scaled, n = (valueNoise(qx, qy, seed) - .5) * 1.4 + (valueNoise(qx * 2.03 + 17, qy * 2.03 + 17, seed + 1) - .5) * .6, l = Math.min(1, Math.max(0, luma(e))), w = gain * (1 - .7 * (2 * l - 1) ** 2);
                return e.map(v => v + n * w) as Colour;
            }, { uCell: scaled, uGain: gain, uSeed: [seed & 65535, seed >>> 16] }, 'uniform float uCell; uniform float uGain; uniform vec2 uSeed;')] : [];
    } });
