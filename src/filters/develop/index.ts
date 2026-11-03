import { defineFilter } from '../../core/filter.js';
import { localPadding, localPasses, type LocalControl } from './local.js';
import { NEUTRAL, type DevelopParams } from './params.js';
import { pointPass } from './point.js';
export * from './params.js';
export * from './maths.js';
export * from './statistics.js';
export { bakeTone, bakeHsl } from './point.js';
export { LOCAL_RADII } from './local.js';

const localControls: readonly LocalControl[] = ['clarity','texture','dehaze'];
/** Exposure/WB (linear) → perceptual tone/balance → levels/curves → HSL → local detail.
 * A partial top-level recipe defaults to NEUTRAL; nested objects must be complete.
 * Never computes statistics or mutates parameters. Radii are in output document pixels.
 */
export const develop = defineFilter<Partial<DevelopParams>>({
  id: 'develop',
  // Hue and steep curves amplify half-float input/intermediate rounding.
  precision: 'full',
  padding(params, scale) { return localControls.reduce((sum,k) => sum + (params[k] ? localPadding(k,scale) : 0), 0); },
  passes(params, scale, frame) {
    const p = { ...NEUTRAL, ...params };
    const point = pointPass(p);
    return [...(point ? [point] : []), ...localControls.flatMap(k => localPasses(k,p[k],scale,frame))];
  },
});
