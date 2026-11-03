import { neighbourhood } from './neighbourhood.js';
export type { NeighbourhoodParams as ArtisticParams } from './neighbourhood.js';
/** amount=0 is neutral. Fixed-grid local oil histogram. */
export const oilPainting = /* @__PURE__ */ neighbourhood('oil-painting', 'oil');
/** amount=0 is neutral. Pencil lines follow local contrast against a smoothed field. */
export const pencilSketch = /* @__PURE__ */ neighbourhood('pencil-sketch', 'pencil');
/** amount=0 is neutral. Smoothed, quantised washes. */
export const watercolour = /* @__PURE__ */ neighbourhood('watercolour', 'watercolour');
/** amount=0 is neutral. Quantised colour with dark local outlines. */
export const cartoon = /* @__PURE__ */ neighbourhood('cartoon', 'cartoon');
