import { defineFilter, type FilterPass, type PixelBuffer } from "../core/index.js";

export interface GaussianBlurParams {
  /** Standard deviation in document pixels. */
  sigma: number;
}

/** Smallest blur worth a pass, at the level being drawn. */
const MIN_SIGMA = 0.05;

const reach = (sigma: number) => Math.ceil(sigma * 3);

const glsl = /* glsl */ `
uniform vec2 uDirection;
uniform float uSigma;
uniform float uRadius;

vec4 filterPixel(ivec2 p) {
  int radius = int(uRadius);
  ivec2 step = ivec2(uDirection);
  ivec2 last = textureSize(uSource, 0) - 1;
  float falloff = 2.0 * uSigma * uSigma;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -radius; i <= radius; i++) {
    float weight = exp(-float(i * i) / falloff);
    sum += weight * texelFetch(uSource, clamp(p + step * i, ivec2(0), last), 0);
    total += weight;
  }
  return sum / total;
}`;

/** Weights from the centre outward, summing to 1 across both sides. */
export function gaussianKernel(sigma: number): Float32Array {
  const radius = reach(sigma);
  const weights = new Float32Array(radius + 1);
  let total = 0;
  for (let i = 0; i <= radius; i++) {
    const weight = Math.exp((-i * i) / (2 * sigma * sigma));
    weights[i] = weight;
    total += i === 0 ? weight : weight * 2;
  }
  return weights.map((weight) => weight / total);
}

function blurAxis(source: PixelBuffer, target: PixelBuffer, sigma: number, horizontal: boolean) {
  const kernel = gaussianKernel(sigma);
  const radius = kernel.length - 1;
  const { width, height, data } = source;
  const stride = horizontal ? 4 : width * 4;
  const count = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const lineStride = horizontal ? width * 4 : 4;
  for (let line = 0; line < lines; line++) {
    const start = line * lineStride;
    for (let at = 0; at < count; at++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const weight = kernel[Math.abs(offset)]!;
        const i = start + Math.min(count - 1, Math.max(0, at + offset)) * stride;
        r += data[i]! * weight;
        g += data[i + 1]! * weight;
        b += data[i + 2]! * weight;
        a += data[i + 3]! * weight;
      }
      const o = start + at * stride;
      target.data[o] = r;
      target.data[o + 1] = g;
      target.data[o + 2] = b;
      target.data[o + 3] = a;
    }
  }
}

const pass = (sigma: number, horizontal: boolean): FilterPass => ({
  id: "gaussian-blur",
  glsl,
  uniforms: { uDirection: horizontal ? [1, 0] : [0, 1], uSigma: sigma, uRadius: reach(sigma) },
  cpu: (source, target, _context) => blurAxis(source, target, sigma, horizontal),
});

/** Separable Gaussian blur with sigma in document pixels, defined for both CPU and GLSL passes. */
export const gaussianBlur = defineFilter<GaussianBlurParams>({
  id: "gaussian-blur",
  padding: ({ sigma }, scale) => (sigma * scale < MIN_SIGMA ? 0 : reach(sigma * scale)),
  passes({ sigma }, scale, _frame) {
    const scaled = sigma * scale;
    return scaled < MIN_SIGMA ? [] : [pass(scaled, true), pass(scaled, false)];
  },
});
