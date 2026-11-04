import { fitEffectParams, type EffectPictureSize } from './catalogue.js';
export type { EffectPictureSize } from './catalogue.js';
/** Serialisable recipes keyed by filter id. Hosts choose labels and actions. */
export interface EffectPreset {
    /** Stable preset identifier; hosts provide localised labels. */
    id: string;
    /**
     * Plain filter parameters keyed by registered filter id, in application order. Lengths are authored for a
     * picture whose long edge is `REFERENCE_EDGE` pixels; `fitPreset` scales them to a picture.
     */
    filters: Record<string, Record<string, unknown>>;
}
/** Serializable named grading recipes; the host supplies localised display labels. */
export const cinematicLooks: readonly EffectPreset[] = [
    // Warm colour negative film: soft contrast, a matte black point, warm highlights over slightly cool
    // shadows, a little less saturation, fine grain and a gentle vignette.
    { id: 'warm-film', filters: { 'colour-grade': { amount: 1, warmth: .3, contrast: .18, saturation: -.12, shadows: [-.01, .005, .025], highlights: [.035, .015, -.02], fade: .35 }, 'film-grain': { amount: .7, seed: 7, size: .6 }, vignette: { amount: .4 } } },
    // Classic black and white cinema: a red-leaning mono mix, a firm S-curve, grain and a darker vignette.
    { id: 'silver-screen', filters: { 'colour-grade': { amount: 1, mono: 1, mix: [.4, .5, .1], contrast: .55, fade: .08 }, 'film-grain': { amount: .9, seed: 11, size: .6 }, vignette: { amount: .6 } } },
    // A soft modern cinema grade: teal shadows, warm highlights, lifted blacks, and light blooming in the highlights.
    { id: 'soft-cinema', filters: { 'colour-grade': { amount: 1, contrast: .12, saturation: -.08, shadows: [-.03, .015, .04], highlights: [.04, .012, -.03], fade: .25 }, bloom: { amount: .5, radius: 14, threshold: .55 }, vignette: { amount: .35 } } }
];
/** Serializable built-in effect stacks for host preset pickers. */
export const effectPresets: readonly EffectPreset[] = [
    { id: 'pencil', filters: { 'pencil-sketch': { amount: 1, radius: 2.5 } } },
    // Newsprint: a contrasty dot screen printed on warm paper.
    { id: 'ink-print', filters: { 'colour-grade': { amount: 1, contrast: .4 }, halftone: { amount: 1, size: 5 }, sepia: { amount: .35 } } },
    // A toy-town miniature: a narrow band of focus, with the saturation and contrast that sell the scale.
    { id: 'miniature', filters: { 'tilt-shift': { amount: 1, radius: 6, focus: .55, band: .22 }, 'colour-grade': { amount: 1, contrast: .25, saturation: .35 } } }
];
/** A preset with its lengths fitted to a picture of `size`; without a size it is returned unchanged. */
export function fitPreset(preset: EffectPreset, size?: EffectPictureSize | null): EffectPreset {
    return size ? { ...preset, filters: Object.fromEntries(Object.entries(preset.filters).map(([id, params]) => [id, fitEffectParams(id, params, size)])) } : preset;
}
