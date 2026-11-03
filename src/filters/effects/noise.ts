import { defineFilter } from '../../core/filter.js';
import { neighbourhood } from './neighbourhood.js';
import { pointPass, hash, strength, type AmountParams, type Colour } from './shared.js';
/** amount=0 is neutral. Size in document pixels; monochrome, deterministic coordinate noise. */
export interface NoiseParams extends AmountParams {
    /** Cell edge in document pixels. */
    size?: number;
    /** Deterministic signed 32-bit noise seed, default 0. */
    seed?: number;
}
/** Seeded reproducible colour noise with amount and size controls. */
export const addNoise = /* @__PURE__ */ defineFilter<NoiseParams>({ id: 'add-noise', padding: () => 0, passes(p, s, f) { const a = strength(p.amount), size = Math.max(1, p.size ?? 1), seed = (p.seed ?? 0) | 0; return a ? [pointPass('add-noise', f, s, a, 'float n=noiseHash(ivec2(floor(doc/(uScale*uSize))),(uint(uSeed.x)|(uint(uSeed.y)<<16u)))-.5;result=c+vec3(n);', (c, x, y) => { const n = hash(Math.floor(x / (s * size)), Math.floor(y / (s * size)), seed) - .5; return c.map(v => v + n) as Colour; }, { uSize: size, uSeed: [seed & 65535, seed >>> 16] }, 'uniform float uSize; uniform vec2 uSeed;')] : []; } });
/** amount=0 is neutral; bilateral colour-distance denoising. */
export const reduceNoise = /* @__PURE__ */ neighbourhood('reduce-noise', 'reduce');
/** amount=0 is neutral; broader bilateral smoothing for film grain. */
export const removeGrain = /* @__PURE__ */ neighbourhood('remove-grain', 'grain');
