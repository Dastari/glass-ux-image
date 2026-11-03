import { defineFilter } from '../../core/filter.js';
import { pointPass, strength, hash, mix, type AmountParams, type Colour } from './shared.js';
/** amount=0 is neutral. The sepia matrix is applied in straight linear RGB. */
export const sepia = /* @__PURE__ */ defineFilter<AmountParams>({ id: 'sepia', padding: () => 0, passes(p, s, f) { const a = strength(p.amount); return a ? [pointPass('sepia', f, s, a, 'result=vec3(dot(c,vec3(.393,.769,.189)),dot(c,vec3(.349,.686,.168)),dot(c,vec3(.272,.534,.131)));', c => [c[0] * .393 + c[1] * .769 + c[2] * .189, c[0] * .349 + c[1] * .686 + c[2] * .168, c[0] * .272 + c[1] * .534 + c[2] * .131])] : []; } });
/** amount=0 is neutral; lifts blacks and compresses highlights. */
export const faded = /* @__PURE__ */ defineFilter<AmountParams>({ id: 'faded', padding: () => 0, passes(p, s, f) { const a = strength(p.amount); return a ? [pointPass('faded', f, s, a, 'result=c*.8+.08;', c => c.map(n => n * .8 + .08) as Colour)] : []; } });
/** Grain cells have document-pixel size; amount=0 is neutral; seed is a signed 32-bit integer. */
export interface GrainParams extends AmountParams {
    /** Deterministic signed 32-bit noise seed, default 0. */
    seed?: number;
    /** Cell edge in document pixels. */
    size?: number;
}
/** Seeded film grain in linear colour, with amount and grain size parameters. */
export const filmGrain = /* @__PURE__ */ defineFilter<GrainParams>({ id: 'film-grain', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount), size = Math.max(1, p.size ?? 1), seed = (p.seed ?? 0) | 0;
        return a ? [pointPass('film-grain', f, s, a, 'float n=noiseHash(ivec2(floor(doc/(uScale*uSize))),(uint(uSeed.x)|(uint(uSeed.y)<<16u)))-.5; result=c+vec3(n*.25*(1.0-abs(2.0*clamp(luminance(c),0.0,1.0)-1.0)));', (c, x, y) => { const n = (hash(Math.floor(x / (s * size)), Math.floor(y / (s * size)), seed) - .5) * .25 * (1 - Math.abs(2 * Math.min(1, Math.max(0, c[0] * .2126 + c[1] * .7152 + c[2] * .0722)) - 1)); return c.map(v => mix(v, v + n, 1)) as Colour; }, { uSize: size, uSeed: [seed & 65535, seed >>> 16] }, 'uniform float uSize; uniform vec2 uSeed;')] : [];
    } });
