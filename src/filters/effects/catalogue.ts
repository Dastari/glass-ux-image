import * as blur from './blur.js';
import * as sharpness from './sharpness.js';
import * as artistic from './artistic.js';
import * as vintage from './vintage.js';
import * as light from './light.js';
import * as pixel from './pixel.js';
import * as noise from './noise.js';
import * as stylisation from './stylisation.js';
import { lutGrading, colourGrade } from './grading.js';
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
    /** Default serialisable parameters for a picture whose long edge is `REFERENCE_EDGE` pixels. */
    params: Record<string, unknown>;
    /** Parameters that are lengths in document pixels, which `effectParams` scales to the picture. */
    lengths: readonly string[];
}
export const effectFilters: readonly Filter<any>[] = [...Object.values(blur), ...Object.values(sharpness), ...Object.values(artistic), ...Object.values(vintage), ...Object.values(light), ...Object.values(pixel), ...Object.values(noise), ...Object.values(stylisation), lutGrading, colourGrade];
export const effectWarps: readonly Warp<any>[] = Object.values(distortion);
const categories: [
    EffectCategory,
    readonly (Filter<any> | Warp<any>)[]
][] = [['blur', Object.values(blur)], ['sharpness', Object.values(sharpness)], ['artistic', Object.values(artistic)], ['vintage', Object.values(vintage)], ['light', Object.values(light)], ['distortion', effectWarps], ['pixel', Object.values(pixel)], ['noise', Object.values(noise)], ['stylisation', Object.values(stylisation)], ['grading', [lutGrading, colourGrade]]];
const labels: Record<string, string> = { 'gaussian-blur': 'gaussianBlur', 'motion-blur': 'motionBlur', 'radial-blur': 'radialBlur', 'lens-blur': 'lensBlur', 'tilt-shift': 'tiltShift', 'unsharp-mask': 'unsharpMask', 'high-pass': 'highPass', 'detail-enhancement': 'detailEnhancement', 'oil-painting': 'oilPainting', 'pencil-sketch': 'pencilSketch', 'film-grain': 'filmGrain', 'lens-flare': 'lensFlare', 'add-noise': 'addNoise', 'reduce-noise': 'reduceNoise', 'remove-grain': 'removeGrain', 'lut-grading': 'lut', 'colour-grade': 'colourGrade' };
/**
 * Default lengths are authored for a picture whose long edge is this many pixels, and scale with the
 * picture, so an effect looks the same on a phone snapshot and a 50-megapixel photograph, and a gallery
 * thumbnail can show it as a faithful miniature. Sharpening, noise and noise reduction stay in pixels:
 * they act on pixel-level detail whatever the picture's size.
 */
export const REFERENCE_EDGE = 1000;
const defaults: Record<string, readonly [Record<string, unknown>, readonly string[]]> = {
    'gaussian-blur': [{ sigma: 4 }, ['sigma']],
    'motion-blur': [{ amount: 1, radius: 12, angle: 0 }, ['radius']],
    'radial-blur': [{ amount: 1, radius: 30 }, ['radius']],
    'lens-blur': [{ amount: 1, radius: 8 }, ['radius']],
    'tilt-shift': [{ amount: 1, radius: 5, focus: .5, band: .25 }, ['radius']],
    'unsharp-mask': [{ amount: 1, radius: 1 }, []],
    'high-pass': [{ amount: 1, radius: 3 }, ['radius']],
    'detail-enhancement': [{ amount: 1, radius: 8 }, ['radius']],
    'oil-painting': [{ amount: 1, radius: 5 }, ['radius']],
    'pencil-sketch': [{ amount: 1, radius: 2.5 }, ['radius']],
    watercolour: [{ amount: 1, radius: 7 }, ['radius']],
    cartoon: [{ amount: 1, radius: 3 }, ['radius']],
    sepia: [{ amount: 1 }, []],
    faded: [{ amount: 1 }, []],
    'film-grain': [{ amount: 1, seed: 7, size: .6 }, ['size']],
    bloom: [{ amount: 1, radius: 12, threshold: .7 }, ['radius']],
    glow: [{ amount: 1, radius: 10 }, ['radius']],
    'lens-flare': [{ amount: 1, radius: 50 }, ['radius']],
    vignette: [{ amount: 1 }, []],
    fisheye: [{ amount: .7, radius: 450 }, ['radius']],
    wave: [{ amount: 6, wavelength: 70 }, ['amount', 'wavelength']],
    ripple: [{ amount: 5, radius: 450, wavelength: 30 }, ['amount', 'radius', 'wavelength']],
    twirl: [{ amount: 1.5, radius: 400 }, ['radius']],
    pixelate: [{ amount: 1, size: 14 }, ['size']],
    mosaic: [{ amount: 1, size: 20 }, ['size']],
    halftone: [{ amount: 1, size: 6 }, ['size']],
    'add-noise': [{ amount: 1, seed: 7, size: 1 }, []],
    'reduce-noise': [{ amount: 1, radius: 2, tolerance: .1 }, []],
    'remove-grain': [{ amount: 1, radius: 3, tolerance: .1 }, []],
    posterise: [{ amount: 1, levels: 6 }, []],
    threshold: [{ amount: 1, pivot: .5 }, []],
    solarise: [{ amount: 1, pivot: .5 }, []],
    emboss: [{ amount: 1, radius: 1.5 }, ['radius']],
    'lut-grading': [{ amount: 1, lut: null }, []],
    'colour-grade': [{ amount: 1 }, []],
};
/** Built-in effect catalogue with category, message key and serialisable default parameters. */
export const effectDefinitions: readonly EffectDefinition[] = categories.flatMap(([category, filters]) => filters.map(filter => ({ id: filter.id, label: labels[filter.id] ?? filter.id, category, params: { ...defaults[filter.id]?.[0] }, lengths: defaults[filter.id]?.[1] ?? [] })));
/** A picture's size in document pixels. */
export interface EffectPictureSize {
    width: number;
    height: number;
}
/**
 * Scale the length parameters of `params` for effect `id` from the reference picture to a picture of `size`.
 * Other parameters, unknown effects and a missing size pass through unchanged.
 */
export function fitEffectParams(id: string, params: Record<string, unknown>, size?: EffectPictureSize | null): Record<string, unknown> {
    const lengths = defaults[id]?.[1], edge = size ? Math.max(size.width, size.height) : 0;
    if (!lengths?.length || !(edge > 0))
        return params;
    const k = edge / REFERENCE_EDGE, out = { ...params };
    for (const key of lengths)
        if (typeof out[key] === 'number')
            out[key] = Math.round((out[key] as number) * k * 100) / 100;
    return out;
}
/** Default parameters of effect `id` fitted to a picture of `size` (the reference picture without one). */
export function effectParams(id: string, size?: EffectPictureSize | null): Record<string, unknown> {
    return fitEffectParams(id, { ...defaults[id]?.[0] }, size);
}
