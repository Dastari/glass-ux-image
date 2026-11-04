import { expect, it, vi } from 'vitest';
import { solidSource, type LayerSpec, type TileSource } from '../core/index.js';
import { createEditorSession } from '../session/index.js';
import { applyDab, applyDabSteps, createDabSurface, DabWorkspace } from './kernels.js';
import { createRetouchStage, StrokeStore } from './store.js';
import type { Stroke } from './stroke.js';

const red: readonly [number, number, number, number] = [1, 0, 0, 1];
async function start() {
  const stage = createRetouchStage();
  const session = createEditorSession({ source: solidSource({ width: 64, height: 64 }, [0, 0, 1, 1]), stages: [stage] });
  await vi.waitFor(() => expect(session.state.status).toBe('ready'));
  session.assets.set({ id: 'green', source: solidSource({ width: 32, height: 32 }, [0, 1, 0, 1]) });
  // Twice the size on screen: layer pixel (8, 8) lands at document (16, 16).
  const layer: LayerSpec = { id: 'g', name: 'Green', kind: 'image', asset: 'green', visible: true, opacity: 1, blend: 'normal', quad: [[0, 0], [64, 0], [64, 64], [0, 64]] };
  session.setLayers([layer]);
  return { session, stage, layer };
}
const pixel = async (source: TileSource, x: number, y: number) => Array.from((await source.readTile({ level: 0, x: 0, y: 0 })).data.slice((y * source.width + x) * 4, (y * source.width + x) * 4 + 4));
const shown = async (session: ReturnType<typeof createEditorSession>, x: number, y: number) => {
  const preview = await session.readPreview(64);
  return Array.from(preview.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)).map(n => Math.round(n * 100) / 100);
};
const dab = (id: string, extra: Partial<Stroke> = {}, tool: Stroke['tool'] = 'brush'): Stroke =>
  ({ id, tool, params: { size: 6, hardness: 1, colour: red }, points: [{ x: 8.5, y: 8.5 }], ...extra });

it('paints a layer in its own pixels, leaves the base alone, and undoes', async () => {
  const { session } = await start();
  expect(session.toLayer('g', 17, 17)).toEqual([8.5, 8.5]);
  expect(session.fromLayer('g', 8.5, 8.5)).toEqual([17, 17]);
  session.commit({ strokes: [dab('a', { layer: 'g' })] }, { label: 'Brush' });
  expect(await pixel(session.layerSources('g')!.pixels, 8, 8)).toEqual([1, 0, 0, 1]);
  expect(await shown(session, 17, 17)).toEqual([1, 0, 0, 1]);
  // Elsewhere the layer stays green, and the base under it was never touched.
  expect(await shown(session, 40, 40)).toEqual([0, 1, 0, 1]);
  session.setLayers(session.state.recipe.layers!.map(layer => ({ ...layer, visible: false })));
  expect(await shown(session, 17, 17)).toEqual([0, 0, 1, 1]);
  session.undo();
  session.undo();
  expect(await pixel(session.layerSources('g')!.pixels, 8, 8)).toEqual([0, 1, 0, 1]);
  session.dispose();
});

it('keeps stroke-only layer changes on the same sources, so only touched tiles recompose', async () => {
  const { session } = await start();
  session.commit({ strokes: [dab('a', { layer: 'g' })] });
  const document = session.document, sources = session.layerSources('g');
  session.commit({ strokes: [...session.state.recipe.strokes!, dab('b', { layer: 'g', points: [{ x: 20.5, y: 20.5 }] })] });
  expect(session.document).toBe(document);
  expect(session.layerSources('g')!.composite).toBe(sources!.composite);
  session.dispose();
});

it('masks a layer: hide all, the brush reveals, the eraser hides, and a disabled mask has no effect', async () => {
  const { session } = await start();
  session.run('layers.mask.add', { id: 'g', fill: 'hide', label: 'Add mask' });
  expect(session.history.current.label).toBe('Add mask');
  expect(await shown(session, 17, 17)).toEqual([0, 0, 1, 1]);
  session.commit({ strokes: [dab('reveal', { layer: 'g', mask: true })] });
  // Revealed: green shows through the mask. The brush colour does not matter on a mask.
  expect(await shown(session, 17, 17)).toEqual([0, 1, 0, 1]);
  expect(await shown(session, 40, 40)).toEqual([0, 0, 1, 1]);
  expect((await pixel(session.layerSources('g')!.mask!, 8, 8))[3]).toBe(1);
  session.commit({ strokes: [...session.state.recipe.strokes!, dab('hide', { layer: 'g', mask: true }, 'eraser')] });
  expect(await shown(session, 17, 17)).toEqual([0, 0, 1, 1]);
  session.run('layers.mask.enable', { id: 'g', enabled: false });
  expect(await shown(session, 40, 40)).toEqual([0, 1, 0, 1]);
  session.run('layers.mask.enable', { id: 'g', enabled: true });
  session.run('layers.mask.delete', { id: 'g', label: 'Delete mask' });
  expect(session.state.recipe.layers![0]!.mask).toBeUndefined();
  expect(session.state.recipe.strokes).toEqual([]);
  expect(await shown(session, 40, 40)).toEqual([0, 1, 0, 1]);
  session.undo();
  expect(session.state.recipe.strokes).toHaveLength(2);
  session.dispose();
});

it('keeps pixel and mask strokes apart, and removing a layer drops its strokes', async () => {
  const { session } = await start();
  session.run('layers.mask.add', { id: 'g' });
  session.commit({ strokes: [dab('base'), dab('pixels', { layer: 'g' }), dab('mask', { layer: 'g', mask: true }, 'eraser')] });
  expect(await shown(session, 17, 17)).toEqual([0, 0, 1, 1]);
  expect(await pixel(session.layerSources('g')!.pixels, 8, 8)).toEqual([1, 0, 0, 1]);
  // The base stroke is at base pixel (8, 8), outside the layer's erased hole.
  session.run('layers.mask.enable', { id: 'g', enabled: false });
  expect(await shown(session, 8, 8)).toEqual([0, 1, 0, 1]);
  session.run('layers.remove', 'g');
  expect(session.state.recipe.strokes!.map(stroke => stroke.id)).toEqual(['base']);
  expect(await shown(session, 8, 8)).toEqual([1, 0, 0, 1]);
  session.dispose();
});

it('isolated reads of another recipe never change the live layer', async () => {
  const { session } = await start();
  const painted = { ...session.state.recipe, strokes: [dab('a', { layer: 'g' })] };
  const branch = session.layerSources('g', { recipe: painted })!;
  expect(await pixel(branch.pixels, 8, 8)).toEqual([1, 0, 0, 1]);
  expect(await pixel(session.layerSources('g')!.pixels, 8, 8)).toEqual([0, 1, 0, 1]);
  session.dispose();
});

it('previews layer and mask strokes through the stage without committing', async () => {
  const { session, stage } = await start();
  session.run('layers.mask.add', { id: 'g' });
  const strokes = [dab('p', { layer: 'g' })];
  session.previewStrokes(strokes);
  await stage.preview(session, strokes);
  expect(await pixel(session.layerSources('g')!.pixels, 8, 8)).toEqual([1, 0, 0, 1]);
  expect(session.state.recipe.strokes).toEqual([]);
  session.revert();
  await stage.preview(session, []);
  expect(await pixel(session.layerSources('g')!.pixels, 8, 8)).toEqual([0, 1, 0, 1]);
  session.dispose();
});

it('a store refuses strokes aimed elsewhere', async () => {
  const store = new StrokeStore(solidSource({ width: 8, height: 8 }, [0, 0, 0, 1]), {}, { layer: 'g' });
  await expect(store.reconcile([dab('base')])).rejects.toThrow(RangeError);
  await expect(store.reconcile([dab('mask', { layer: 'g', mask: true })])).rejects.toThrow(RangeError);
  await expect(store.reconcile([dab('ok', { layer: 'g' })])).resolves.not.toHaveLength(0);
});

it('splits a large dab into steps with the same result', () => {
  const surface = () => {
    const s = createDabSurface({ x: 0, y: 0, width: 260, height: 260 });
    for (let i = 0; i < s.data.length; i += 4) s.data.set([((i / 4) % 260) / 260, ((i / 4 / 260) | 0) / 260, .3, 1], i);
    return s;
  };
  const params = { size: 250, hardness: .5, sourceOffset: { x: 3, y: 2 }, strength: .8 };
  const point = { x: 130, y: 130, pressure: 1, dx: 0, dy: 0 };
  const whole = surface(), split = surface();
  applyDab(whole, 'heal', params, point, new DabWorkspace());
  let steps = 0;
  for (const _ of applyDabSteps(split, 'heal', params, point, new DabWorkspace())) steps++;
  // Twelve Jacobi passes plus set-up and the final pass, each in sixteen-row steps.
  expect(steps).toBeGreaterThan(14 * 10);
  expect(split.data).toEqual(whole.data);
});

it('pauses inside one large dab within the budget, without changing pixels', async () => {
  const base = solidSource({ width: 600, height: 600 }, [.5, .5, .5, 1]);
  let yields = 0;
  const yieldNow = async () => { yields++; await Promise.resolve(); };
  const stroke: Stroke = { id: 'big', tool: 'heal', params: { size: 560, hardness: .5, sourceOffset: { x: 4, y: 0 } }, points: [{ x: 300, y: 300 }] };
  const split = new StrokeStore(base, { yield: yieldNow });
  await split.reconcile([stroke]);
  expect(split.stats.dabApplications).toBe(1);
  expect(split.stats.dabPauses).toBeGreaterThan(0);
  expect(yields).toBeGreaterThan(0);
  const whole = new StrokeStore(base);
  await whole.reconcile([stroke]);
  const a = await split.readTile({ level: 0, x: 1, y: 1 }), b = await whole.readTile({ level: 0, x: 1, y: 1 });
  expect(a.data).toEqual(b.data);
});
