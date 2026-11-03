import { defineFilter, type PixelBuffer } from "../core/index.js";

export interface SharpenParams {
  /** 0–100. */
  amount: number;
}

/** Spread of the unsharp mask in document pixels. */
const SIGMA = 1.2;
/** Strength at full amount. */
const STRENGTH = 2;
/** Below this spread, at the level being drawn, there is no detail left to sharpen. */
const MIN_SIGMA = 0.3;

const reach = (sigma: number) => Math.ceil(sigma * 3);

const glsl = /* glsl */ `
uniform float uSigma;
uniform float uRadius;
uniform float uStrength;

vec4 filterPixel(ivec2 p) {
  int radius = int(uRadius);
  ivec2 last = textureSize(uSource, 0) - 1;
  float falloff = 2.0 * uSigma * uSigma;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int y = -radius; y <= radius; y++) {
    for (int x = -radius; x <= radius; x++) {
      float weight = exp(-float(x * x + y * y) / falloff);
      sum += weight * texelFetch(uSource, clamp(p + ivec2(x, y), ivec2(0), last), 0);
      total += weight;
    }
  }
  vec4 color = texelFetch(uSource, p, 0);
  vec4 sharp = color + (color - sum / total) * uStrength;
  float alpha = clamp(sharp.a, 0.0, 1.0);
  return vec4(clamp(sharp.rgb, vec3(0.0), vec3(alpha)), alpha);
}`;

function cpu(source: PixelBuffer, target: PixelBuffer, sigma: number, strength: number) {
  const { width, height, data } = source;
  const radius = reach(sigma);
  const span = radius * 2 + 1;
  const weights = new Float32Array(span * span);
  let total = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const weight = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      weights[(y + radius) * span + x + radius] = weight;
      total += weight;
    }
  }
  const sum = new Float32Array(4);
  const sharp = new Float32Array(4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sum.fill(0);
      for (let dy = -radius; dy <= radius; dy++) {
        const row = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const weight = weights[(dy + radius) * span + dx + radius]!;
          const i = (row * width + Math.min(width - 1, Math.max(0, x + dx))) * 4;
          for (let c = 0; c < 4; c++) sum[c]! += data[i + c]! * weight;
        }
      }
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) sharp[c] = data[o + c]! + (data[o + c]! - sum[c]! / total) * strength;
      const alpha = Math.min(1, Math.max(0, sharp[3]!));
      for (let c = 0; c < 3; c++) target.data[o + c] = Math.min(alpha, Math.max(0, sharp[c]!));
      target.data[o + 3] = alpha;
    }
  }
}

/** Opt-in sharpening kernel with matching CPU and GLSL passes. */
export const sharpen = defineFilter<SharpenParams>({
  id: "sharpen",
  padding: ({ amount }, scale) => (amount <= 0 || SIGMA * scale < MIN_SIGMA ? 0 : reach(SIGMA * scale)),
  passes({ amount }, scale, _frame) {
    const sigma = SIGMA * scale;
    if (amount <= 0 || sigma < MIN_SIGMA) return [];
    const strength = (amount / 100) * STRENGTH;
    return [{ id: "sharpen", glsl, uniforms: { uSigma: sigma, uRadius: reach(sigma), uStrength: strength }, cpu: (source, target, _context) => cpu(source, target, sigma, strength) }];
  },
});
