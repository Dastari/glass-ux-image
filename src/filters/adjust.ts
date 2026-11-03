import { defineFilter, type PixelBuffer } from "../core/index.js";

/** Each value runs from -100 to 100, and 0 leaves the picture alone. */
export interface AdjustParams {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
}

/** Zero-valued simple adjustments that preserve the input picture. */
export const NEUTRAL_ADJUST: AdjustParams = { brightness: 0, contrast: 0, saturation: 0, warmth: 0 };

/** Stops of exposure at full brightness. */
const BRIGHTNESS_STOPS = 1.5;
/** Curve exponent, as a power of two, at full contrast. */
const CONTRAST_POWER = 1;
/** Contrast pivots on middle grey, which stays where it is. */
const MIDDLE_GREY = 0.18;
const WARMTH_RANGE = 0.3;

const uniformsFor = ({ brightness, contrast, saturation, warmth }: AdjustParams) => ({
  uGain: 2 ** ((brightness / 100) * BRIGHTNESS_STOPS),
  uPower: 2 ** ((contrast / 100) * CONTRAST_POWER),
  uSaturation: 1 + saturation / 100,
  uRed: 1 + (warmth / 100) * WARMTH_RANGE,
  uBlue: 1 - (warmth / 100) * WARMTH_RANGE,
});

const glsl = /* glsl */ `
uniform float uGain;
uniform float uPower;
uniform float uSaturation;
uniform float uRed;
uniform float uBlue;

vec4 filterPixel(ivec2 p) {
  vec4 color = texelFetch(uSource, p, 0);
  if (color.a <= 0.0) return color;
  vec3 c = color.rgb / color.a * uGain;
  c *= vec3(uRed, 1.0, uBlue);
  c = ${MIDDLE_GREY} * pow(max(c, vec3(0.0)) / ${MIDDLE_GREY}, vec3(uPower));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(luma + (c - luma) * uSaturation, vec3(0.0));
  return vec4(c * color.a, color.a);
}`;

function cpu(source: PixelBuffer, target: PixelBuffer, params: AdjustParams) {
  const { uGain, uPower, uSaturation, uRed, uBlue } = uniformsFor(params);
  const from = source.data;
  const to = target.data;
  const curve = (value: number) => MIDDLE_GREY * (Math.max(value, 0) / MIDDLE_GREY) ** uPower;
  for (let i = 0; i < from.length; i += 4) {
    const alpha = from[i + 3]!;
    to[i + 3] = alpha;
    if (alpha <= 0) {
      to[i] = from[i]!;
      to[i + 1] = from[i + 1]!;
      to[i + 2] = from[i + 2]!;
      continue;
    }
    const r = curve((from[i]! / alpha) * uGain * uRed);
    const g = curve((from[i + 1]! / alpha) * uGain);
    const b = curve((from[i + 2]! / alpha) * uGain * uBlue);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    to[i] = Math.max(luma + (r - luma) * uSaturation, 0) * alpha;
    to[i + 1] = Math.max(luma + (g - luma) * uSaturation, 0) * alpha;
    to[i + 2] = Math.max(luma + (b - luma) * uSaturation, 0) * alpha;
  }
}

const isNeutral = ({ brightness, contrast, saturation, warmth }: AdjustParams) => !brightness && !contrast && !saturation && !warmth;

/** Basic brightness, contrast, saturation and warmth in linear premultiplied RGBA. */
export const adjust = defineFilter<AdjustParams>({
  id: "adjust",
  padding: () => 0,
  passes: (params, _scale, _frame) => (isNeutral(params) ? [] : [{ id: "adjust", glsl, uniforms: uniformsFor(params), cpu: (source, target, _context) => cpu(source, target, params) }]),
});
