import { defineFilter } from '../../core/filter.js';
import { tonePass, hash, strength, type AmountParams, type Colour } from './shared.js';
export { reduceNoise, removeGrain } from './neighbourhood.js';
/** amount=0 is neutral. Size in document pixels; deterministic coordinate noise. */
export interface NoiseParams extends AmountParams {
    /** Cell edge in document pixels. */
    size?: number;
    /** Deterministic signed 32-bit noise seed, default 0. */
    seed?: number;
}
/** Peak perceptual offset at full strength: ±10%, near Photoshop's default 12.5% uniform noise. */
const NOISE = .2;
/**
 * Seeded reproducible colour noise with amount and size controls: an independent uniform offset per
 * channel in perceptual space. When cells are smaller than a pixel of the level being drawn, the offset
 * shrinks as an average of that many cells would, so a zoomed-out view shows the noise as it really reads.
 */
export const addNoise = /* @__PURE__ */ defineFilter<NoiseParams>({ id: 'add-noise', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount), size = Math.max(1, p.size ?? 1), seed = (p.seed ?? 0) | 0, scaled = s * size, gain = NOISE * Math.min(1, scaled);
        return a ? [tonePass('add-noise', f, s, a, 'ivec2 q=ivec2(floor(doc/uCell));uint sd=uint(uSeed.x)|(uint(uSeed.y)<<16u);e+=(vec3(noiseHash(q,sd),noiseHash(q,sd+1u),noiseHash(q,sd+2u))-.5)*uGain;', (e, x, y) => { const qx = Math.floor(x / scaled), qy = Math.floor(y / scaled); return e.map((v, k) => v + (hash(qx, qy, seed + k) - .5) * gain) as Colour; }, { uCell: scaled, uGain: gain, uSeed: [seed & 65535, seed >>> 16] }, 'uniform float uCell; uniform float uGain; uniform vec2 uSeed;')] : [];
    } });
