/** Edge of a square tile, in pixels at its own pyramid level. */
export const TILE_SIZE = 256;

/**
 * Pixels composed around each tile. A renderer draws only the inner tile, so linear sampling at its
 * edge reads real neighbouring pixels and tiles join without a seam.
 */
export const TILE_GUTTER = 1;

/** Linear-light, premultiplied RGBA. Every backend works in this form. */
export interface PixelBuffer {
  /** Pixel columns in this buffer. */
  width: number;
  /** Pixel rows in this buffer. */
  height: number;
  /** Four floats per pixel: `width * height * 4` long. */
  data: Float32Array;
}

/** Allocate a zero-filled linear premultiplied RGBA buffer with four floats per pixel. */
export function createPixels(width: number, height: number): PixelBuffer {
  return { width, height, data: new Float32Array(width * height * 4) };
}

/** Decode one sRGB channel in 0–1 to linear light. */
export function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Encode one linear channel in 0–1 to sRGB. */
export function linearToSrgb(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

const decodeTable = new Float32Array(256);
for (let i = 0; i < 256; i++) decodeTable[i] = srgbToLinear(i / 255);

/** Convert straight-alpha sRGB bytes, as canvases and decoders give them, to working pixels. */
export function pixelsFromRgba8(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): PixelBuffer {
  const out = createPixels(width, height);
  for (let i = 0; i < width * height * 4; i += 4) {
    const alpha = rgba[i + 3]! / 255;
    out.data[i] = decodeTable[rgba[i]!]! * alpha;
    out.data[i + 1] = decodeTable[rgba[i + 1]!]! * alpha;
    out.data[i + 2] = decodeTable[rgba[i + 2]!]! * alpha;
    out.data[i + 3] = alpha;
  }
  return out;
}

/** Convert working pixels to straight-alpha sRGB bytes for display or encoding. */
export function pixelsToRgba8(pixels: PixelBuffer, into?: Uint8ClampedArray): Uint8ClampedArray {
  // A clamped array rounds to the nearest byte on assignment, so nothing here adds 0.5.
  const { data } = pixels;
  const out = into ?? new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]!;
    const unpremultiply = alpha > 0 ? 1 / alpha : 0;
    out[i] = linearToSrgb(data[i]! * unpremultiply) * 255;
    out[i + 1] = linearToSrgb(data[i + 1]! * unpremultiply) * 255;
    out[i + 2] = linearToSrgb(data[i + 2]! * unpremultiply) * 255;
    out[i + 3] = alpha * 255;
  }
  return out;
}
