import { describe, expect, it } from 'vitest';
import { createPixels } from '../core/pixels.js';
import { edgeMask, fillEdgePixels, inpaint } from './inpaint.js';

/** Straight-alpha sRGB bytes from a colour function. */
function picture(width: number, height: number, colour: (x: number, y: number) => [number, number, number, number?]) {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const [r, g, b, a = 255] = colour(x, y); bytes.set([r, g, b, a], (y * width + x) * 4); }
  return bytes;
}
const stripes = (x: number, y: number): [number, number, number] => (Math.floor(y / 6) % 2 ? [200, 60, 40] : [30, 90, 210]);
/** Mean absolute difference over marked pixels between two pictures. */
function error(a: Uint8ClampedArray, b: Uint8ClampedArray, mask: Uint8Array) {
  let sum = 0, n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { for (let c = 0; c < 3; c++) sum += Math.abs(a[i * 4 + c]! - b[i * 4 + c]!); n += 3; }
  return sum / n;
}

describe('inpaint', () => {
  it('continues a regular texture into an empty corner wedge', async () => {
    const width = 160, height = 120, truth = picture(width, height, stripes), bytes = new Uint8ClampedArray(truth), mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (x + y < 40 || width - x + height - y < 50) { mask[y * width + x] = 1; bytes.set([0, 0, 0, 0], (y * width + x) * 4); }
    await inpaint(bytes, width, height, mask);
    // A flat fill would be off by about 80 on average; the stripes carry on instead.
    expect(error(bytes, truth, mask)).toBeLessThan(25);
    for (let i = 0; i < mask.length; i++) if (mask[i]) expect(bytes[i * 4 + 3]).toBe(255);
  });

  it('continues a smooth gradient without a seam', async () => {
    const width = 140, height = 100, colour = (x: number, y: number): [number, number, number] => [60 + x, 80 + y, 200 - x / 2];
    const truth = picture(width, height, colour), bytes = new Uint8ClampedArray(truth), mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < 12; x++) { mask[y * width + x] = 1; bytes.set([0, 0, 0, 0], (y * width + x) * 4); }
    await inpaint(bytes, width, height, mask);
    // Across the seam the colour should be close to the first known column.
    let jump = 0;
    for (let y = 0; y < height; y++) for (let c = 0; c < 3; c++) jump += Math.abs(bytes[(y * width + 11) * 4 + c]! - bytes[(y * width + 12) * 4 + c]!);
    expect(jump / (height * 3)).toBeLessThan(12);
  });

  it('keeps unmarked pixels exactly, and lays partly covered ones over the fill', async () => {
    const width = 64, height = 48, bytes = picture(width, height, () => [120, 120, 120]), mask = new Uint8Array(width * height);
    const original = new Uint8ClampedArray(bytes);
    for (let y = 0; y < height; y++) { mask[y * width] = 1; bytes.set([0, 0, 0, 0], y * width * 4); mask[y * width + 1] = 1; bytes.set([255, 255, 255, 128], (y * width + 1) * 4); }
    await inpaint(bytes, width, height, mask);
    for (let i = 0; i < mask.length; i++) if (!mask[i]) expect([...bytes.subarray(i * 4, i * 4 + 4)]).toEqual([...original.subarray(i * 4, i * 4 + 4)]);
    // Half white over a grey fill, mixed in linear light, lands between them and nearer the white.
    const mixed = bytes[(5 * width + 1) * 4]!;
    expect(mixed).toBeGreaterThan(190);
    expect(mixed).toBeLessThan(255);
    expect(bytes[(5 * width + 1) * 4 + 3]).toBe(255);
  });

  it('is repeatable for a seed', async () => {
    const width = 96, height = 64, mask = new Uint8Array(width * height);
    for (let i = 0; i < width * 10; i++) mask[i] = 1;
    const run = async () => { const bytes = picture(width, height, (x, y) => [(x * 37 + y * 11) % 255, (x * 7) % 255, (y * 23) % 255]); return inpaint(bytes, width, height, mask, { seed: 7 }); };
    expect(await run()).toEqual(await run());
  });

  it('yields between slices and stops when aborted', async () => {
    const width = 200, height = 150, bytes = picture(width, height, stripes), mask = new Uint8Array(width * height);
    for (let i = 0; i < width * 30; i++) mask[i] = 1;
    let pauses = 0;
    const done = await inpaint(new Uint8ClampedArray(bytes), width, height, mask, { sliceMs: 0, pause: async () => { pauses++; } });
    expect(done).toBeTruthy();
    expect(pauses).toBeGreaterThan(5);
    const controller = new AbortController();
    const run = inpaint(new Uint8ClampedArray(bytes), width, height, mask, { sliceMs: 0, signal: controller.signal, pause: async () => controller.abort(new Error('stop')) });
    await expect(run).rejects.toThrow('stop');
  });

  it('falls back to a smooth fill when no patch is wholly known', async () => {
    const width = 8, height = 8, bytes = picture(width, height, () => [90, 100, 110]), mask = new Uint8Array(width * height);
    for (let i = 0; i < 40; i++) mask[i] = 1;
    await inpaint(bytes, width, height, mask);
    expect([...bytes.subarray(0, 4)]).toEqual([90, 100, 110, 255]);
  });
});

describe('edge mask', () => {
  it('marks what lies outside the footprint and its soft border, and keeps the picture’s own transparency', () => {
    const width = 20, height = 20;
    // A diamond footprint, with a transparent hole in the middle of the picture itself.
    const footprint = [[10, 0], [20, 10], [10, 20], [0, 10]] as const;
    const bytes = picture(width, height, (x, y) => {
      const inside = Math.abs(x + .5 - 10) + Math.abs(y + .5 - 10) <= 10;
      if (x >= 9 && x <= 10 && y >= 9 && y <= 10) return [0, 0, 0, 0];
      return inside ? [50, 50, 50, Math.abs(x + .5 - 10) + Math.abs(y + .5 - 10) > 9 ? 128 : 255] : [0, 0, 0, 0];
    });
    const mask = edgeMask(bytes, width, height, footprint);
    expect(mask[0]).toBe(1);
    expect(mask[10 * width + 10]).toBe(0);
    expect(mask[9]).toBe(1);
    expect(mask[10 * width + 5]).toBe(0);
    // Without a footprint, anything less than opaque is an edge.
    expect(edgeMask(bytes, width, height, null)[10 * width + 10]).toBe(1);
  });

  it('runs from working pixels, reporting how much it filled', async () => {
    const pixels = createPixels(48, 32);
    for (let y = 0; y < 32; y++) for (let x = 8; x < 48; x++) pixels.data.set([.2, .3, .4, 1], (y * 48 + x) * 4);
    const { bytes, filled } = await fillEdgePixels({ pixels, footprint: [[8, 0], [48, 0], [48, 32], [8, 32]] });
    expect(filled).toBe(8 * 32);
    expect(bytes[3]).toBe(255);
    expect(Math.abs(bytes[0]! - bytes[(48 * 4 + 20) * 4]!)).toBeLessThan(3);
  });
});
