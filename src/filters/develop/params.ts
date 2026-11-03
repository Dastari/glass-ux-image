import { IDENTITY_CURVE, NEUTRAL_LEVELS, type CurvePoint, type Levels, type Triple } from './maths.js';
export type Channel = 'rgb' | 'red' | 'green' | 'blue';
/** Ordered hue ranges used by the HSL mixer. */
export const COLOUR_RANGES = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;
export type ColourRange = typeof COLOUR_RANGES[number];
export interface HslAdjustment { hue: number; saturation: number; luminance: number }
/** Plain recipe data. Two-way sliders are -100…100; exposure is stops (-5…5),
 * hueShift is degrees (-180…180), temperature is relative warmth (-100…100).
 * Levels use normalised perceptual values and gamma, curves use normalised points.
 * Colour balance triples are red/green/blue offsets (-100…100) in perceptual space.
 */
export interface DevelopParams {
  exposure: number; brightness: number; contrast: number; highlights: number; shadows: number;
  whites: number; blacks: number; temperature: number; tint: number; saturation: number;
  vibrance: number; hueShift: number; clarity: number; texture: number; dehaze: number;
  hsl: Record<ColourRange, HslAdjustment>;
  levels: Record<Channel, Levels>;
  curves: Record<Channel, readonly CurvePoint[]>;
  colourBalance: { shadows: Triple; midtones: Triple; highlights: Triple };
}
/** Fully neutral parameters yield no passes. Treat this recursively frozen value as immutable. */
export const NEUTRAL: Readonly<DevelopParams> = Object.freeze({
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temperature: 0, tint: 0, saturation: 0, vibrance: 0, hueShift: 0, clarity: 0, texture: 0, dehaze: 0,
  hsl: Object.freeze(Object.fromEntries(COLOUR_RANGES.map(c => [c, Object.freeze({ hue: 0, saturation: 0, luminance: 0 })])) as Record<ColourRange, HslAdjustment>),
  levels: Object.freeze({ rgb: NEUTRAL_LEVELS, red: NEUTRAL_LEVELS, green: NEUTRAL_LEVELS, blue: NEUTRAL_LEVELS }),
  curves: Object.freeze({ rgb: IDENTITY_CURVE, red: IDENTITY_CURVE, green: IDENTITY_CURVE, blue: IDENTITY_CURVE }),
  colourBalance: Object.freeze({ shadows: Object.freeze([0,0,0]) as Triple, midtones: Object.freeze([0,0,0]) as Triple, highlights: Object.freeze([0,0,0]) as Triple }),
});
/** Default develop parameters that leave the picture unchanged. */
export const NEUTRAL_DEVELOP = NEUTRAL;
