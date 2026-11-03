import { defineFilter } from '../../core/filter.js';
import { pointPass, strength, luma, type AmountParams, type Colour } from './shared.js';
/** amount=0 is neutral. Levels defaults to 6, threshold/solarise pivot to .5 in linear light. */
export interface StylisationParams extends AmountParams {
    /** Number of output levels, from 2 to 256; default 6. */
    levels?: number;
    /** Linear threshold value, default .5. */
    pivot?: number;
}
/** Quantise colour into a chosen number of levels. */
export const posterise = /* @__PURE__ */ defineFilter<StylisationParams>({ id: 'posterise', precision: 'full', padding: () => 0, passes(p, s, f) { const a = strength(p.amount), n = Math.max(2, Math.min(256, Math.round(p.levels ?? 6))) - 1; return a ? [pointPass('posterise', f, s, a, 'result=floor(clamp(c,0.0,1.0)*uLevels+.5)/uLevels;', c => c.map(v => Math.floor(Math.min(1, Math.max(0, v)) * n + .5) / n) as Colour, { uLevels: n }, 'uniform float uLevels;')] : []; } });
/** Map luminance around a pivot to black or white. */
export const threshold = /* @__PURE__ */ defineFilter<StylisationParams>({ id: 'threshold', precision: 'full', padding: () => 0, passes(p, s, f) { const a = strength(p.amount), pivot = p.pivot ?? .5; return a ? [pointPass('threshold', f, s, a, 'result=vec3(step(uPivot,luminance(c)));', c => { const v = luma(c) >= pivot ? 1 : 0; return [v, v, v]; }, { uPivot: pivot }, 'uniform float uPivot;')] : []; } });
/** Invert channel values above a pivot. */
export const solarise = /* @__PURE__ */ defineFilter<StylisationParams>({ id: 'solarise', precision: 'full', padding: () => 0, passes(p, s, f) { const a = strength(p.amount), pivot = p.pivot ?? .5; return a ? [pointPass('solarise', f, s, a, 'result=mix(c,1.0-c,step(vec3(uPivot),c));', c => c.map(v => v >= pivot ? 1 - v : v) as Colour, { uPivot: pivot }, 'uniform float uPivot;')] : []; } });
export { emboss } from './neighbourhood.js';
