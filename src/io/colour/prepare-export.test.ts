import { expect, it } from 'vitest';
import { createPixels } from '../../core/pixels.js';
import { prepareExportPixels } from './prepare-export.js';

it('averages premultiplied colours and alpha before compositing over linear white', async () => {
  const source = createPixels(2, 2);
  source.data.set([0, 0, 0, .5, 1, 1, 1, 1, 0, 0, 0, .5, 1, 1, 1, 1]);
  expect(Array.from((await prepareExportPixels(source, 1, 1, false)).data)).toEqual([.5, .5, .5, .75]);
  expect(Array.from((await prepareExportPixels(source, 1, 1, true)).data)).toEqual([.75, .75, .75, 1]);
  expect(Array.from(source.data.slice(0, 4))).toEqual([0, 0, 0, .5]);
});

it('uses pixel coverage when reducing by a non-integer factor', async () => {
  const source = createPixels(3, 1);
  source.data.set([0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1]);
  const result = await prepareExportPixels(source, 2, 1, false);
  for (const i of [0, 4]) expect(result.data[i]).toBeCloseTo(1 / 3, 6);
  expect(result.data[3]).toBe(1);
  expect(result.data[7]).toBe(1);
});

it('interpolates pixel centres when enlarging without clipping wide-gamut floats', async () => {
  const source = createPixels(2, 1);
  source.data.set([-1, 0, 2, 1, 1, 2, 0, 1]);
  expect(Array.from((await prepareExportPixels(source, 4, 1, false)).data)).toEqual([
    -1, 0, 2, 1, -.5, .5, 1.5, 1, .5, 1.5, .5, 1, 1, 2, 0, 1,
  ]);
});

it('composites without resizing or mutating the working source', async () => {
  const source = createPixels(1, 1);
  source.data.set([.25, -.1, .75, .5]);
  const result = await prepareExportPixels(source, 1, 1, true);
  expect(Array.from(result.data)).toEqual([.75, expect.closeTo(.4, 6), 1.25, 1]);
  expect(source.data[3]).toBe(.5);
});
