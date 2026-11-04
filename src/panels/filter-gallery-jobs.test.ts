import { afterEach, expect, it, vi } from 'vitest';
import { acquireThumbnails, renderThumbnail } from './filter-gallery-jobs.js';

const pixels = () => ({ width: 1, height: 1, data: new Float32Array(4) });

function stubWorkers() {
  const workers: Array<{ postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal('Worker', class {
    constructor() {
      const worker = { postMessage: vi.fn(), terminate: vi.fn() };
      workers.push(worker);
      return worker;
    }
  });
  return workers;
}

afterEach(() => vi.unstubAllGlobals());

it('cancels an active thumbnail without waiting for a silent worker', async () => {
  const workers = stubWorkers();
  const release = acquireThumbnails();
  const controller = new AbortController();
  const work = renderThumbnail(pixels(), [], 1, controller.signal);
  controller.abort();
  await expect(work).rejects.toThrow('Thumbnail cancelled');
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  release();
});

it('starts the next job after the active one is cancelled', () => {
  const workers = stubWorkers();
  const release = acquireThumbnails();
  const controller = new AbortController();
  const first = renderThumbnail(pixels(), [], 1, controller.signal);
  const next = renderThumbnail(pixels(), [], 1, new AbortController().signal);
  first.catch(() => {});
  next.catch(() => {});
  controller.abort();
  expect(workers).toHaveLength(2);
  expect(workers[1]!.postMessage).toHaveBeenCalledOnce();
  release();
});

it('cancels a queued thumbnail without touching the active one', async () => {
  const workers = stubWorkers();
  const release = acquireThumbnails();
  const controller = new AbortController();
  const active = renderThumbnail(pixels(), [], 1, new AbortController().signal);
  const queued = renderThumbnail(pixels(), [], 1, controller.signal);
  active.catch(() => {});
  controller.abort();
  await expect(queued).rejects.toThrow('Thumbnail cancelled');
  expect(workers[0]!.terminate).not.toHaveBeenCalled();
  release();
});

it('samples the centre at the thumbnail aspect and averages what it shrinks', async () => {
  const { sampleThumbnail } = await import('./filter-gallery-jobs.js');
  // 6 × 2, left third 0, middle third 1, right third 0: a 1 × 1 thumbnail cuts the middle square.
  const data = new Float32Array(6 * 2 * 4);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 6; x++) data.fill(x >= 2 && x < 4 ? 1 : 0, (y * 6 + x) * 4, (y * 6 + x) * 4 + 4);
  const square = sampleThumbnail({ width: 6, height: 2, data }, 1, 1);
  expect(square.sourceWidth).toBe(2);
  expect(Array.from(square.pixels.data)).toEqual([1, 1, 1, 1]);
  // The whole strip at 3:1 into 3 × 1: each pixel averages a 2 × 2 block.
  const strip = sampleThumbnail({ width: 6, height: 2, data }, 3, 1);
  expect(strip.sourceWidth).toBe(6);
  expect(Array.from(strip.pixels.data.filter((_, i) => i % 4 === 0))).toEqual([0, 1, 0]);
  // Enlarging a 2 × 1 ramp keeps the ends and interpolates between them.
  const ramp = new Float32Array([0, 0, 0, 1, 1, 1, 1, 1]);
  const wide = sampleThumbnail({ width: 2, height: 1, data: ramp }, 4, 2);
  const reds = Array.from(wide.pixels.data.filter((_, i) => i % 4 === 0)).slice(0, 4);
  expect(reds[0]).toBe(0);
  expect(reds[3]).toBe(1);
  expect(reds[1]).toBeGreaterThan(0);
  expect(reds[1]).toBeLessThan(reds[2]!);
});
