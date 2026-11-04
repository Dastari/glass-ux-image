import { defineFilter } from '../../core/filter.js';
import { tonePass, strength, luma, smoothstep, type AmountParams, type Colour } from './shared.js';
/**
 * Level edges ramp over 4% of a level (threshold: 0.4% of the range) instead of a hard step: it reads as a
 * hard edge, avoids stair-step aliasing, and keeps a value on a boundary from flipping a whole level between
 * the GPU's and the CPU's last-bit rounding of the sRGB curve.
 */
const EDGE = .02;
/**
 * amount=0 is neutral. Levels defaults to 6. Levels and pivots are perceptual (sRGB-encoded) values, as
 * Photoshop's Posterize, Threshold and Solarize use them: a pivot of .5 is the middle grey of the screen.
 */
export interface StylisationParams extends AmountParams {
    /** Number of output levels per channel, from 2 to 256; default 6. */
    levels?: number;
    /** Perceptual pivot from 0 to 1, default .5. */
    pivot?: number;
}
/** Quantise each perceptual channel into a chosen number of evenly spaced levels, with anti-aliased edges. */
export const posterise = /* @__PURE__ */ defineFilter<StylisationParams>({ id: 'posterise', precision: 'full', padding: () => 0, passes(p, s, f) { const a = strength(p.amount), n = Math.max(2, Math.min(256, Math.round(p.levels ?? 6))) - 1; return a ? [tonePass('posterise', f, s, a, 'vec3 x=clamp(e,0.0,1.0)*uLevels;e=(floor(x)+smoothstep(vec3(.5-uEdge),vec3(.5+uEdge),fract(x)))/uLevels;', e => e.map(v => { const x = Math.min(1, Math.max(0, v)) * n, k = Math.floor(x); return (k + smoothstep(.5 - EDGE, .5 + EDGE, x - k)) / n; }) as Colour, { uLevels: n, uEdge: EDGE }, 'uniform float uLevels; uniform float uEdge;')] : []; } });
/** Map perceptual luminance above the pivot to white, and below it to black, with an anti-aliased edge. */
export const threshold = /* @__PURE__ */ defineFilter<StylisationParams>({ id: 'threshold', precision: 'full', padding: () => 0, passes(p, s, f) { const a = strength(p.amount), pivot = p.pivot ?? .5; return a ? [tonePass('threshold', f, s, a, 'e=vec3(smoothstep(uPivot-uEdge,uPivot+uEdge,luminance(e)));', e => { const v = smoothstep(pivot - EDGE / 10, pivot + EDGE / 10, luma(e)); return [v, v, v]; }, { uPivot: pivot, uEdge: EDGE / 10 }, 'uniform float uPivot; uniform float uEdge;')] : []; } });
/**
 * Solarise (the Sabattier effect): perceptual values above the pivot are reversed, and the folded curve is
 * stretched back to full range, so the brightest areas turn dark with a bright rim where the fold peaks.
 */
export const solarise = /* @__PURE__ */ defineFilter<StylisationParams>({ id: 'solarise', precision: 'full', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount), pivot = Math.min(.95, Math.max(.05, p.pivot ?? .5));
        return a ? [tonePass('solarise', f, s, a, 'vec3 v=clamp(e,0.0,1.0);e=mix(v/uPivot,(1.0-v)/(1.0-uPivot),step(vec3(uPivot),v))*.85;', e => e.map(n => { const v = Math.min(1, Math.max(0, n)); return (v >= pivot ? (1 - v) / (1 - pivot) : v / pivot) * .85; }) as Colour, { uPivot: pivot }, 'uniform float uPivot;')] : [];
    } });
export { emboss } from './neighbourhood.js';
