import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPixels, pixelSource, pixelsFromRgba8 } from '../core/index.js';
import { encodeImage } from '../io/encode.js';
import type { EncodeOptions } from '../io/encode-core.js';
import { createEditorSession } from './session.js';
import { generatedProfile, matrices, parametric } from '../../e2e/fixtures/colour.js';

let captured: { bytes: Uint8ClampedArray; width: number; height: number };
const stop = new Error('Captured encoder input');
beforeEach(() => {
  vi.stubGlobal('ImageData', class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  vi.stubGlobal('OffscreenCanvas', class {
    bytes = new Uint8ClampedArray();
    constructor(public width: number, public height: number) {}
    getContext() {
      return { putImageData: (image: ImageData) => { this.bytes = image.data.slice(); } };
    }
    async convertToBlob() {
      captured = { bytes: this.bytes, width: this.width, height: this.height };
      throw stop;
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

for (const [name, settings, resize] of [
  ['JPEG', { type: 'image/jpeg' }, false],
  ['alpha:false PNG', { type: 'image/png', alpha: false }, false],
  ['maxEdge resize', { maxEdge: 129 }, true],
  ['explicit resize', { width: 129, height: 1 }, true],
  ['resize with alpha removal', { width: 129, height: 1, alpha: false }, true],
] as const) it(`session and headless profile exports agree for ${name}`, async () => {
  // Cross a tile boundary; all resized pairs contain one black and one white pixel.
  const width = 258, height = 2, bytes = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    const grey = resize && (i / 4 % width) % 2 ? 255 : 0;
    bytes.set([grey, grey, grey, resize ? 255 : 128], i);
  }
  const options: EncodeOptions = { ...settings, icc: generatedProfile(matrices.srgb, parametric(0, [1])) };
  await expect(encodeImage(bytes, width, height, options)).rejects.toBe(stop);
  const headless = captured!;
  const session = createEditorSession({ source: pixelSource(pixelsFromRgba8(bytes, width, height)) });
  try {
    await vi.waitFor(() => expect(session.state.status).toBe('ready'));
    await expect(session.result().toBlob(options)).rejects.toBe(stop);
    expect(captured!.width).toBe(resize ? 129 : width);
    expect(captured!.height).toBe(resize ? 1 : height);
    expect(captured!.bytes).toEqual(headless.bytes);
    const expected = resize ? 128 : 127;
    for (let i = 0; i < captured!.bytes.length; i += 4) {
      // Fixed-point ICC matrix coefficients can put neutral .5 on either side of byte rounding.
      for (let c = 0; c < 3; c++) expect(Math.abs(captured!.bytes[i + c]! - expected)).toBeLessThanOrEqual(1);
      expect(captured!.bytes[i + 3]).toBe(255);
    }
  } finally { session.dispose(); }
});

it('keeps out-of-sRGB-gamut floats until resizing and destination conversion finish', async () => {
  const pixels = createPixels(2, 1);
  const { profileConversion } = await import('../io/colour/index.js');
  const icc = generatedProfile(), transform = profileConversion(icc).transform!;
  const red = transform.toLinear(1, 0, 0);
  pixels.data.set([...red, 1, ...red.map(v => v * .5), .5]);
  const session = createEditorSession({ source: pixelSource(pixels) });
  try {
    await vi.waitFor(() => expect(session.state.status).toBe('ready'));
    await expect(session.result().toBlob({ icc, width: 1, height: 1 })).rejects.toBe(stop);
    expect(Array.from(captured!.bytes)).toEqual([255, 0, 0, 191]);
  } finally { session.dispose(); }
});
