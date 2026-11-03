import { expect, it } from 'vitest';
import { createImageDocument } from '../core/document.js';
import { geometrySource, normaliseGeometry } from '../core/geometry.js';
import { TileCache } from '../core/tile-cache.js';
import { solidSource, type TileSource } from '../core/tile-source.js';
import { CpuBackend } from '../render/cpu-backend.js';
import { Renderer } from '../render/renderer.js';
import { StrokeStore } from './store.js';

class HeadlessBackend extends CpuBackend {
  override get canvas() { return { width: 256, height: 256 } as HTMLCanvasElement; }
  override resize() {}
  override present() {}
}

it('settle waits for a queued stroke before its first dirty notification, through geometry and tile caches', async () => {
  const white = solidSource({ width: 512, height: 512 }, [1, 1, 1, 1]);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const base: TileSource = { ...white, async readTile(tile) {
    if (tile.level === 0) { entered(); await gate; }
    return white.readTile(tile);
  } };
  const store = new StrokeStore(base), cache = new TileCache(store);
  const source = geometrySource(cache, normaliseGeometry());
  const document = createImageDocument(source); document.addLayer({ source });
  const renderer = new Renderer({ document, backend: new HeadlessBackend() });
  renderer.setView({ width: 256, height: 256, zoom: .5, centerX: 256, centerY: 256 });
  await renderer.settle();
  const revision = document.revision;
  const editing = store.reconcile([{ id: 'final-dab', tool: 'brush', params: { size: 8, hardness: 1, colour: [0, 0, 0, 1] }, points: [{ x: 20, y: 20 }] }]);
  await started;
  // Last-frame statistics still say zero, although a submitted edit has not published yet.
  expect(renderer.stats.pendingTiles).toBe(0); expect(document.revision).toBe(revision);
  let settled = false;
  const finishing = renderer.settle().then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(settled).toBe(false);
  release(); await editing; await finishing;
  expect(document.revision).toBeGreaterThan(revision);
  expect(renderer.stats.pendingTiles).toBe(0);
  expect(renderer.readTile({ level: 1, x: 0, y: 0 })!.data[(10 * 256 + 10) * 4]).toBe(0);
  renderer.dispose(); document.dispose(); cache.dispose();
});
