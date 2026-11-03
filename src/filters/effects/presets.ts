/** Serialisable recipes keyed by filter id. Hosts choose labels and actions. */
export interface EffectPreset {
    /** Stable preset identifier; hosts provide localised labels. */
    id: string;
    /** Plain filter parameters keyed by registered filter id. */
    filters: Record<string, Record<string, unknown>>;
}
/** Serializable named grading recipes; the host supplies localised display labels. */
export const cinematicLooks: readonly EffectPreset[] = [
    { id: 'warm-film', filters: { sepia: { amount: .22 }, faded: { amount: .3 }, 'film-grain': { amount: .18, seed: 7, size: 1.5 }, vignette: { amount: .25 } } },
    { id: 'silver-screen', filters: { 'lut-grading': { amount: 1, lut: { size: 2, values: [0, 0, 0, .2126, .2126, .2126, .7152, .7152, .7152, .9278, .9278, .9278, .0722, .0722, .0722, .2848, .2848, .2848, .7874, .7874, .7874, 1, 1, 1] } }, 'film-grain': { amount: .2, seed: 11 }, vignette: { amount: .3 } } },
    { id: 'soft-cinema', filters: { faded: { amount: .25 }, bloom: { amount: .25, radius: 12, threshold: .6 }, vignette: { amount: .2 } } }
];
/** Serializable built-in effect stacks for host preset pickers. */
export const effectPresets: readonly EffectPreset[] = [
    { id: 'pencil', filters: { 'pencil-sketch': { amount: 1, radius: 2 } } },
    { id: 'ink-print', filters: { halftone: { amount: 1, size: 8 } } },
    { id: 'miniature', filters: { 'tilt-shift': { amount: 1, radius: 6, focus: .5, band: .2 } } }
];
