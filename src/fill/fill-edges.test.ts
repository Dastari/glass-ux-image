import { describe, expect, it, vi } from 'vitest';
import { createPixels, pixelSource } from '../core/index.js';
import { createEditorSession, type ActionRequest } from '../session/index.js';
import { fillEdgesAction } from '../tools/fill-edges.js';
import { hasEmptyEdges } from './edges.js';
import { fillEdges, NoEmptyEdgesError } from './fill-edges.js';

// Encoding and decoding need a browser; here the bytes go straight back in as the new base.
vi.mock('../io/encode-core.js', () => ({ encodeRasterImage: async (bytes: Uint8ClampedArray, width: number, height: number) => Object.assign(new Blob([]), { bytes, width, height }) }));

function textured(width: number, height: number) {
  const pixels = createPixels(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.data.set([((x >> 3) & 1) * .5 + .2, .3, ((y >> 3) & 1) * .4 + .1, 1], (y * width + x) * 4);
  return pixelSource(pixels);
}

async function start(onAction?: (action: ActionRequest, next: (args?: unknown) => unknown) => unknown) {
  const session = createEditorSession({ source: textured(120, 80), tools: [{ id: 'fill', actions: [fillEdgesAction] }], ...(onAction ? { onAction } : {}) });
  await vi.waitFor(() => expect(session.state.status).toBe('ready'));
  // Stand in for the browser decoder: wrap the bytes as a tile source.
  session.decodeImage = async (blob) => {
    const { bytes, width, height } = blob as unknown as { bytes: Uint8ClampedArray; width: number; height: number };
    const { pixelsFromRgba8 } = await import('../core/pixels.js');
    return pixelSource(pixelsFromRgba8(bytes, width, height));
  };
  return session;
}

describe('fill edges', () => {
  it('says whether geometry leaves empty edges', () => {
    const size = { width: 120, height: 80 }, base = { rotation: 0 as const, flipX: false, flipY: false, crop: null };
    expect(hasEmptyEdges(size, base)).toBe(false);
    expect(hasEmptyEdges(size, { ...base, angle: 5 })).toBe(true);
    expect(hasEmptyEdges(size, { ...base, angle: 5, angleFit: 'inset' })).toBe(false);
    expect(hasEmptyEdges(size, { ...base, canvas: { rect: { x: -10, y: 0, width: 140, height: 80 }, fill: [1, 1, 1, 1] } })).toBe(true);
    expect(hasEmptyEdges(size, { ...base, canvas: { rect: { x: 10, y: 10, width: 50, height: 50 }, fill: null } })).toBe(false);
    expect(hasEmptyEdges(size, { ...base, angle: 5, crop: { x: 30, y: 30, width: 40, height: 20 } })).toBe(false);
  });

  it('bakes the base with its geometry into one undoable step, keeping filters and layer places', async () => {
    const seen: string[] = [];
    const session = await start((action, next) => { seen.push(action.id); return next(); });
    session.commit({ geometry: { ...session.state.recipe.geometry, angle: 6 }, filters: { adjust: { brightness: .1 } }, layers: [] }, { label: 'Rotate' });
    const before = session.state.size!, original = session.original;
    await session.run('image.fillEdges', { label: 'Fill edges', seed: 3 });
    expect(seen).toEqual(['edit.commit', 'image.fillEdges', 'edit.commit']);
    expect(session.history.current.label).toBe('Fill edges');
    expect(session.state.recipe.geometry).toMatchObject({ rotation: 0, angle: 0, distort: null, crop: null });
    expect(session.state.recipe.filters).toEqual({ adjust: { brightness: .1 } });
    expect(session.state.size).toEqual(before);
    const pixels = await session.readPreview(1000);
    let transparent = 0;
    for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i]! < .999) transparent++;
    expect(transparent).toBe(0);
    session.undo();
    expect(session.original).toBe(original);
    expect(session.state.recipe.geometry.angle).toBe(6);
    session.dispose();
  });

  it('grows the base to an expanded canvas, where layers keep their place', async () => {
    const session = await start();
    const quad = [[10, 10], [40, 10], [40, 30], [10, 30]] as const;
    session.commit({ geometry: { ...session.state.recipe.geometry, canvas: { rect: { x: -20, y: -10, width: 160, height: 100 }, fill: null } } });
    // Layers would need a decoded asset to render, so only their placement is checked: work space moves by the canvas offset.
    const { geometryMapping } = await import('../core/index.js');
    const mapping = geometryMapping(session.state.sourceSize!, session.state.recipe.geometry);
    expect(quad.map(([x, y]) => mapping.fromWork(x, y))).toEqual([[30, 20], [60, 20], [60, 40], [30, 40]]);
    await fillEdges(session, { label: 'Fill edges' });
    expect(session.state.sourceSize).toEqual({ width: 160, height: 100 });
    session.dispose();
  });

  it('refuses when nothing is empty, and when the host stops it', async () => {
    const session = await start();
    await expect(fillEdges(session, { label: 'Fill edges' })).rejects.toBeInstanceOf(NoEmptyEdgesError);
    expect(session.history.nodes).toHaveLength(1);
    session.dispose();
    const refused = await start((action, next) => action.id === 'image.fillEdges' ? undefined : next());
    refused.commit({ geometry: { ...refused.state.recipe.geometry, angle: 4 } });
    expect(refused.run('image.fillEdges', { label: 'Fill edges' })).toBeUndefined();
    expect(refused.history.nodes).toHaveLength(2);
    refused.dispose();
  });

  it('stops when aborted, changing nothing', async () => {
    const session = await start();
    session.commit({ geometry: { ...session.state.recipe.geometry, angle: 8 } });
    const controller = new AbortController();
    const run = fillEdges(session, { label: 'Fill edges', signal: controller.signal, onProgress: value => { if (value > .1) controller.abort(new Error('cancelled')); } });
    await expect(run).rejects.toThrow();
    expect(session.history.nodes).toHaveLength(2);
    session.dispose();
  });
});
