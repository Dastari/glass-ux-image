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
