import * as blur from './blur.js';
import * as sharpness from './sharpness.js';
import * as artistic from './artistic.js';
import * as vintage from './vintage.js';
import * as light from './light.js';
import * as pixel from './pixel.js';
import * as noise from './noise.js';
import * as stylisation from './stylisation.js';
import { lutGrading } from './grading.js';
import * as distortion from './distortion.js';
import type { Filter } from '../../core/filter.js';
import type { Warp } from '../../core/warp.js';
/** The categories exposed by the effects tool's sections. */
export type EffectCategory = 'blur' | 'sharpness' | 'artistic' | 'vintage' | 'light' | 'distortion' | 'pixel' | 'noise' | 'stylisation' | 'grading';
/** A serialisable applied effect. Duplicate filter ids are allowed; instance ids are unique. */
export interface EffectEntry {
    /** Stable instance id, retained when reordered. */
    id: string;
    /** Registered filter or warp id. */
    filter: string;
    /** Kernel parameters in document pixels. */
    params: Record<string, unknown>;
    /** Blend with the preceding picture, 0–1. Zero is neutral. */
    strength: number;
}
/** A built-in effect and its default parameters, suitable for plain gallery lists. */
export interface EffectDefinition {
    /** Filter or warp id. */
    id: string;
    /** Message key for the effect's name. */
    label: string;
    /** Gallery category. */
    category: EffectCategory;
    /** Default serialisable parameters. */
    params: Record<string, unknown>;
}
export const effectFilters: readonly Filter<any>[] = [...Object.values(blur), ...Object.values(sharpness), ...Object.values(artistic), ...Object.values(vintage), ...Object.values(light), ...Object.values(pixel), ...Object.values(noise), ...Object.values(stylisation), lutGrading];
export const effectWarps: readonly Warp<any>[] = Object.values(distortion);
const categories: [
    EffectCategory,
    readonly (Filter<any> | Warp<any>)[]
][] = [['blur', Object.values(blur)], ['sharpness', Object.values(sharpness)], ['artistic', Object.values(artistic)], ['vintage', Object.values(vintage)], ['light', Object.values(light)], ['distortion', effectWarps], ['pixel', Object.values(pixel)], ['noise', Object.values(noise)], ['stylisation', Object.values(stylisation)], ['grading', [lutGrading]]];
const labels: Record<string, string> = { 'gaussian-blur': 'gaussianBlur', 'motion-blur': 'motionBlur', 'radial-blur': 'radialBlur', 'lens-blur': 'lensBlur', 'tilt-shift': 'tiltShift', 'unsharp-mask': 'unsharpMask', 'high-pass': 'highPass', 'detail-enhancement': 'detailEnhancement', 'oil-painting': 'oilPainting', 'pencil-sketch': 'pencilSketch', 'film-grain': 'filmGrain', 'lens-flare': 'lensFlare', 'add-noise': 'addNoise', 'reduce-noise': 'reduceNoise', 'remove-grain': 'removeGrain', 'lut-grading': 'lut' };
/** Built-in effect catalogue with category, message key and serialisable default parameters. */
export const effectDefinitions: readonly EffectDefinition[] = categories.flatMap(([category, filters]) => filters.map(filter => ({ id: filter.id, label: labels[filter.id] ?? filter.id, category, params: filter.id === 'gaussian-blur' ? { sigma: 3 } : filter.id === 'lut-grading' ? { amount: 1, lut: null } : category === 'distortion' ? { amount: filter.id === 'wave' || filter.id === 'ripple' ? 8 : .7, radius: 150, wavelength: 40 } : { amount: 1, radius: category === 'blur' ? 4 : 2, ...(filter.id === 'lens-flare' ? { radius: 80 } : {}), ...(category === 'pixel' ? { size: 12 } : {}), ...(category === 'vintage' || category === 'noise' ? { seed: 7, size: 1 } : {}), ...(filter.id === 'bloom' ? { threshold: .7 } : {}), ...(filter.id === 'posterise' ? { levels: 6 } : {}), ...(['threshold', 'solarise'].includes(filter.id) ? { pivot: .5 } : {}) } })));
