import { createPixels, pixelsToRgba8, type PixelBuffer } from '../../core/pixels.js';
import { pixelsToProfile, type ColourTransform } from './index.js';

const nextTask = () => new Promise<void>(resolve => setTimeout(resolve));

/**
 * Resize in linear, premultiplied sRGB, retaining out-of-gamut floats. Reduction integrates
 * each output pixel's footprint; enlargement interpolates neighbouring pixel centres.
 * Alpha removal composites over working-space white after resampling.
 */
export async function prepareExportPixels(source: PixelBuffer, width: number, height: number, opaque: boolean): Promise<PixelBuffer> {
  let pixels = source;
  let sliceStart = performance.now();
  let samples = 0;
  // Reduce first when one dimension shrinks and the other grows, avoiding a large intermediate.
  const axes: readonly ('x' | 'y')[] = width / source.width <= height / source.height ? ['x', 'y'] : ['y', 'x'];
  for (const axis of axes) {
    const length = axis === 'x' ? width : height;
    const previous = axis === 'x' ? pixels.width : pixels.height;
    if (length === previous) continue;
    const target = createPixels(axis === 'x' ? length : pixels.width, axis === 'y' ? length : pixels.height);
    const ratio = previous / length;
    for (let y = 0; y < target.height; y++) {
      for (let x = 0; x < target.width; x++) {
        const at = axis === 'x' ? x : y;
        const centre = (at + .5) * ratio - .5;
        const start = ratio > 1 ? at * ratio : Math.floor(centre);
        const end = ratio > 1 ? (at + 1) * ratio : start + 2;
        const to = (y * target.width + x) * 4;
        let red = 0, green = 0, blue = 0, alpha = 0;
        for (let i = Math.floor(start); i < Math.ceil(end); i++) {
          const weight = ratio > 1 ? (Math.min(end, i + 1) - Math.max(start, i)) / ratio : 1 - Math.abs(centre - i);
          const sample = Math.max(0, Math.min(previous - 1, i));
          const from = ((axis === 'y' ? sample : y) * pixels.width + (axis === 'x' ? sample : x)) * 4;
          red += pixels.data[from]! * weight;
          green += pixels.data[from + 1]! * weight;
          blue += pixels.data[from + 2]! * weight;
          alpha += pixels.data[from + 3]! * weight;
          // Also budget very wide rows and reductions to a single output pixel.
          if (++samples === 4096) {
            samples = 0;
            if (performance.now() - sliceStart >= 8) { await nextTask(); sliceStart = performance.now(); }
          }
        }
        target.data[to] = red;
        target.data[to + 1] = green;
        target.data[to + 2] = blue;
        target.data[to + 3] = alpha;
      }
      if (performance.now() - sliceStart >= 8) { await nextTask(); sliceStart = performance.now(); }
    }
    pixels = target;
  }
  if (!opaque) return pixels;
  // Never mutate the caller's source, including when no resize was requested.
  const output = pixels === source ? createPixels(width, height) : pixels;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, white = 1 - pixels.data[i + 3]!;
      for (let c = 0; c < 3; c++) output.data[i + c] = pixels.data[i + c]! + white;
      output.data[i + 3] = 1;
      if (++samples === 4096) {
        samples = 0;
        if (performance.now() - sliceStart >= 8) { await nextTask(); sliceStart = performance.now(); }
      }
    }
    if (performance.now() - sliceStart >= 8) { await nextTask(); sliceStart = performance.now(); }
  }
  return output;
}

/** Convert the finished working image in bounded chunks, clipping only at the output edge. */
export async function encodeExportPixels(pixels: PixelBuffer, transform?: ColourTransform): Promise<Uint8ClampedArray> {
  const bytes = new Uint8ClampedArray(pixels.data.length);
  let sliceStart = performance.now();
  for (let start = 0; start < pixels.data.length; start += 4096 * 4) {
    const data = pixels.data.subarray(start, start + 4096 * 4);
    const chunk = { width: data.length / 4, height: 1, data };
    bytes.set(transform ? pixelsToProfile(chunk, transform) : pixelsToRgba8(chunk), start);
    if (performance.now() - sliceStart >= 8) { await nextTask(); sliceStart = performance.now(); }
  }
  return bytes;
}
