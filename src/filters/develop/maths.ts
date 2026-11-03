import type { DataTexture } from '../../core/filter.js';

export type Triple = readonly [number, number, number];
export type CurvePoint = readonly [number, number];
/** Clamp a channel value to its supported interval. */
export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x));
/** Cubic smoothstep over a normalised interval. */
export const smooth = (lo: number, hi: number, x: number): number => { const t = clamp((x - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
/** Relative linear-light luminance using RGB channel weights. */
export const luminance = (c: Triple): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
/** Extended sRGB transfer, deliberately preserving values above display white. */
export const perceptual = (x: number): number => x <= 0.0031308 ? Math.max(0, x) * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
/** Interpolate between scalar endpoints. */
export const linear = (x: number): number => x <= 0.04045 ? Math.max(0, x) / 12.92 : ((x + 0.055) / 1.055) ** 2.4;

/** Hue in turns, saturation and lightness in 0–1. */
export function rgbToHsl(c: Triple): Triple {
  const max = Math.max(...c), min = Math.min(...c), d = max - min, l = (max + min) / 2;
  if (d <= 1e-7) return [0, 0, l];
  let h = max === c[0] ? (c[1] - c[2]) / d : max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
  h = ((h / 6) % 1 + 1) % 1;
  return [h, d / Math.max(1e-7, 1 - Math.abs(2 * l - 1)), l];
}
/** Convert normalised HSL to straight RGB channel values. */
export function hslToRgb([h, s, l]: Triple): Triple {
  const a = s * (1 - Math.abs(2 * l - 1));
  const channel = (offset: number) => { const k = ((h * 6 + offset) % 6 + 6) % 6; return l + a * (clamp(Math.abs(k - 3) - 1) - 0.5); };
  return [channel(0), channel(4), channel(2)];
}

export interface Levels { inputBlack: number; gamma: number; inputWhite: number; outputBlack: number; outputWhite: number }
/** Unchanged black, gamma, white and output levels. */
export const NEUTRAL_LEVELS: Readonly<Levels> = Object.freeze({ inputBlack: 0, gamma: 1, inputWhite: 1, outputBlack: 0, outputWhite: 1 });
/** Normalised perceptual levels. Gamma > 1 lifts midtones; a collapsed input is a step. */
export function applyLevels(x: number, p: Levels): number {
  const t = p.inputWhite <= p.inputBlack ? Number(x > p.inputBlack) : clamp((x - p.inputBlack) / (p.inputWhite - p.inputBlack));
  return p.outputBlack + (p.outputWhite - p.outputBlack) * t ** (1 / Math.max(0.01, p.gamma));
}

/** Shape-preserving cubic Hermite spline (weighted harmonic tangents, zero at extrema).
 * Points must have finite, strictly increasing x in [0,1], and y in [0,1].
 * Monotone input stays monotone; non-monotone creative curves have no segment overshoot.
 */
export function curveSpline(points: readonly CurvePoint[]): (x: number) => number {
  if (points.length < 2 || points.some((p, i) => !p.every(Number.isFinite) || p.some(v => v < 0 || v > 1) || (i > 0 && p[0] <= points[i - 1]![0]))) throw new RangeError('Invalid curve points');
  const n = points.length, d = points.slice(1).map((p, i) => (p[1] - points[i]![1]) / (p[0] - points[i]![0]));
  const m = points.map((_, i) => {
    if (i === 0) return d[0]!;
    if (i === n - 1) return d[n - 2]!;
    const a = d[i - 1]!, b = d[i]!;
    if (a * b <= 0) return 0;
    const h0 = points[i]![0] - points[i - 1]![0], h1 = points[i + 1]![0] - points[i]![0];
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / a + w1 / b);
  });
  return x => {
    if (x <= points[0]![0]) return points[0]![1];
    if (x >= points[n - 1]![0]) return points[n - 1]![1];
    let i = 0; while (x > points[i + 1]![0]) i++;
    const a = points[i]!, b = points[i + 1]!, h = b[0] - a[0], t = (x - a[0]) / h;
    return (2*t*t*t - 3*t*t + 1)*a[1] + (t*t*t - 2*t*t + t)*h*m[i]! + (-2*t*t*t + 3*t*t)*b[1] + (t*t*t - t*t)*h*m[i + 1]!;
  };
}
/** Straight normalised curve from black to white. */
export const IDENTITY_CURVE: readonly CurvePoint[] = Object.freeze([Object.freeze([0, 0] as const), Object.freeze([1, 1] as const)]);
/** Bake RGB functions to an RGBA float texture. Kernels interpolate texelFetch manually. */
export function bakeTable(functions: readonly ((x: number) => number)[], size = 1024): DataTexture {
  if (!Number.isInteger(size) || size < 2) throw new RangeError('Table size must be at least two');
  const data = new Float32Array(size * 4);
  for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) data[i * 4 + c] = functions[c]!(i / (size - 1));
  return { width: size, height: 1, data };
}
/** Interpolate a normalised position in a channel lookup table. */
export function tableSample(table: DataTexture, x: number, channel: number): number {
  const p = clamp(x) * (table.width - 1), i = Math.floor(p), j = Math.min(table.width - 1, i + 1), t = p - i;
  return table.data[i * 4 + channel]! * (1 - t) + table.data[j * 4 + channel]! * t;
}
/** Relative 6500 K white balance: positive temperature warms, positive tint adds magenta.
 * Kelvin is a gain approximation, not chromatic adaptation or camera RAW calibration.
 */
export function kelvinTintToGains(kelvin: number, tint = 0): Triple {
  const t = clamp(Math.log2(clamp(kelvin, 2000, 14000) / 6500), -2, 2);
  return [2 ** (t * 0.45 + tint / 500), 2 ** (-tint / 250), 2 ** (-t * 0.45 + tint / 500)];
}
