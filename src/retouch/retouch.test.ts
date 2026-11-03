import { describe, expect, it } from 'vitest';
import { createPixels, type PixelBuffer } from '../core/pixels.js';
import { pixelSource, solidSource } from '../core/tile-source.js';
import { applyDab, createDabSurface, DabWorkspace, findSpotSource } from './kernels.js';
import { createLiquifyGrid, liquifyDab, liquifyWarp, mapLiquify } from './liquify.js';
import { createRetouchStage, StrokeStore } from './store.js';
import { strokeDabs, type RetouchTool, type Stroke } from './stroke.js';

const tools: RetouchTool[] = ['brush', 'eraser', 'clone', 'heal', 'spot-heal', 'patch', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'colour-replace', 'red-eye'];
function picture(width = 520, height = 48): PixelBuffer {
  const p = createPixels(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = (x + y) % 11 === 0 ? 0 : .8, i = (y * width + x) * 4;
    p.data.set([((x * 7 % 31) / 40) * a, ((y * 3 % 19) / 24) * a, .2 * a, a], i);
  }
  return p;
}
const stroke = (id: string, tool: RetouchTool = 'brush'): Stroke => ({ id, tool, params: { size: 24, colour: [.7, .1, .2, .8], sourceOffset: { x: -9, y: 3 }, hardness: .4, opacity: .7, flow: .8 }, points: [{ x: 254, y: 24, pressure: .8 }] });
async function flatten(store: StrokeStore) {
  const p = createPixels(store.width, store.height);
  for (let y = 0; y < Math.ceil(store.height / 256); y++) for (let x = 0; x < Math.ceil(store.width / 256); x++) {
    const t = await store.readTile({ level: 0, x, y });
    for (let row = 0; row < t.height; row++) p.data.set(t.data.subarray(row * t.width * 4, (row + 1) * t.width * 4), ((y * 256 + row) * p.width + x * 256) * 4);
  }
  return p;
}

describe('stroke replay and tiles', () => {
  it('spaces along arc length with pressure interpolation and deterministic segmentation', () => {
    const a = stroke('a'); a.params = { size: 10, spacing: .5 }; a.points = [{ x: 0, y: 0, pressure: 0 }, { x: 20, y: 0, pressure: 1 }];
    const b = { ...a, points: [{ x: 0, y: 0, pressure: 0 }, { x: 10, y: 0, pressure: .5 }, { x: 20, y: 0, pressure: 1 }] };
    expect([...strokeDabs(a)]).toEqual([...strokeDabs(b)]);
    expect([...strokeDabs(a)].map(p => p.pressure)).toEqual([0, .25, .5, .75, 1]);
  });
  it.each(tools)('%s across an interior tile seam equals one whole-buffer dab exactly', async tool => {
    const base = picture(), s = stroke('s', tool), store = new StrokeStore(pixelSource(base));
    // Auto search is global and deterministic; use the same frozen search domain as the store.
    const surface = { ...picture(), x: 0, y: 0 }, dab = [...strokeDabs(s)][0]!;
    let offset = s.params.sourceOffset!;
    if (tool === 'spot-heal') {
      const x = 168, search = createDabSurface({ x, y: 0, width: 172, height: 48 });
      for (let y = 0; y < 48; y++) search.data.set(base.data.subarray((y * 520 + x) * 4, (y * 520 + x + 172) * 4), y * 172 * 4);
      offset = findSpotSource(search, dab, s.params);
    }
    if (tool === 'smudge') offset = { x: 0, y: 0 };
    applyDab(surface, tool, s.params, dab, new DabWorkspace(), surface, offset);
    await store.reconcile([s]);
    expect((await flatten(store)).data).toEqual(surface.data);
  });
  it.each(['heal', 'blur', 'clone'] as const)('%s also agrees at a four-tile corner', async tool => {
    const p = picture(520, 520), surface = { ...picture(520, 520), x: 0, y: 0 };
    const s = { ...stroke('corner', tool), points: [{ x: 256, y: 256 }] };
    const store = new StrokeStore(pixelSource(p));
    applyDab(surface, tool, s.params, [...strokeDabs(s)][0]!, new DabWorkspace());
    await store.reconcile([s]); const result = await flatten(store);
    let mismatches = 0;
    for (let i = 0; i < result.data.length; i++) if (result.data[i] !== surface.data[i]) mismatches++;
    expect(mismatches).toBe(0);
  });
  it('extends a live stroke using new dabs and new dirty rectangles only', async () => {
    const base = pixelSource(picture()), store = new StrokeStore(base), fresh = new StrokeStore(base);
    const initial = { ...stroke('live'), points: [{ x: 20, y: 20 }, { x: 100, y: 20 }] };
    const extended = { ...initial, points: [...initial.points, { x: 140, y: 20 }] };
    await store.reconcile([initial]); const before = store.stats.dabApplications;
    const rectangles = await store.reconcile([extended]);
    expect(store.stats.dabApplications - before).toBe([...strokeDabs(extended)].length - [...strokeDabs(initial)].length);
    expect(rectangles.every(rect => rect.x > 85)).toBe(true);
    await fresh.reconcile([extended]); expect((await flatten(store)).data).toEqual((await flatten(fresh)).data);
  });
  it('replays JSON data identically and restores a retained undo without applying any dabs', async () => {
    const base = pixelSource(picture()), store = new StrokeStore(base);
    const strokes = Array.from({ length: 30 }, (_, i) => stroke(String(i), tools[i % tools.length]!));
    await store.reconcile(strokes);
    const fresh = new StrokeStore(base); await fresh.reconcile(JSON.parse(JSON.stringify(strokes)) as Stroke[]);
    expect((await flatten(store)).data).toEqual((await flatten(fresh)).data);
    const count = store.stats.dabApplications;
    const changed = await store.reconcile(strokes.slice(0, -1));
    expect(store.stats.dabApplications).toBe(count);
    expect(changed.every(r => r.x >= 0 && r.x + r.width <= store.width)).toBe(true);
    await fresh.reconcile(strokes.slice(0, -1));
    expect((await flatten(store)).data).toEqual((await flatten(fresh)).data);
  });
  it('evicts history by snapshot, replays older history and rejects an oversized edit atomically', async () => {
    const base = pixelSource(picture(32, 32)), store = new StrokeStore(base, { maxBytes: 32 * 32 * 16 });
    const strokes = Array.from({ length: 5 }, (_, i) => ({ ...stroke(String(i)), points: [{ x: 16, y: 16 }] }));
    await store.reconcile(strokes);
    expect(store.retainedBytes).toBeLessThanOrEqual(32 * 32 * 16);
    const before = store.stats.dabApplications;
    await store.reconcile(strokes.slice(0, 2));
    expect(store.stats.dabApplications - before).toBe(2);
    const tiny = new StrokeStore(base, { maxBytes: 1 });
    await expect(tiny.reconcile(strokes)).rejects.toThrow(RangeError);
    expect((await flatten(tiny)).data).toEqual(picture(32, 32).data);
  });
  it('updates cached mip regions exactly at odd image edges, including undo', async () => {
    const base = pixelSource(picture(521, 257)), store = new StrokeStore(base);
    const a = { ...stroke('edge'), points: [{ x: 518, y: 253 }] };
    const b = { ...stroke('edge2', 'eraser'), points: [{ x: 514, y: 252 }] };
    for (const strokes of [[a], [a, b], [a], []]) {
      await store.reconcile(strokes);
      const expected = pixelSource(await flatten(store));
      const tile = await store.readTile({ level: 2, x: 0, y: 0 });
      expect(tile.data).toEqual((await expected.readTile({ level: 2, x: 0, y: 0 })).data);
    }
  });
  it('prioritises edits and fine tiles over an obsolete coarse read', async () => {
    const base = pixelSource(picture(520, 48));
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const store = new StrokeStore({ ...base, async readTile(tile) { if (tile.level > 0) { entered(); await gate; } return base.readTile(tile); } });
    const first = { ...stroke('a'), points: [{ x: 30, y: 24 }] };
    await store.reconcile([first]);
    const coarse = store.readTile({ level: 1, x: 0, y: 0 }); await started;
    const second = { ...stroke('b'), points: [{ x: 300, y: 24 }] };
    await store.reconcile([first, second]);
    const fine = await store.readTile({ level: 0, x: 1, y: 0 });
    expect(fine.data).not.toEqual((await base.readTile({ level: 0, x: 1, y: 0 })).data);
    release();
    const full = await flatten(store), expected = pixelSource(full);
    expect((await coarse).data).toEqual((await expected.readTile({ level: 1, x: 0, y: 0 })).data);
  });
  it('downsamples dirty tiles only and invalidates affected ancestors only', async () => {
    const store = new StrokeStore(pixelSource(picture(1024, 80)));
    const s = { ...stroke('a'), points: [{ x: 30, y: 30 }] };
    await store.reconcile([s]);
    const events: unknown[] = []; store.invalidated(r => events.push(r));
    const mip = await store.readTile({ level: 1, x: 0, y: 0 });
    const full = await flatten(store), reference = pixelSource(full);
    expect(mip.data).toEqual((await reference.readTile({ level: 1, x: 0, y: 0 })).data);
    await store.readTile({ level: 1, x: 1, y: 0 });
    const count = store.stats.downsampledTiles;
    await store.reconcile([s, { ...stroke('b'), points: [{ x: 800, y: 30 }] }]);
    expect(await store.readTile({ level: 1, x: 0, y: 0 })).toBe(mip);
    expect(store.stats.downsampledTiles).toBe(count);
    expect(events.length).toBe(1);
  });
  it.each(['heal', 'spot-heal', 'patch'] as const)('%s remains finite at transparent image corners', async tool => {
    const store = new StrokeStore(pixelSource(createPixels(20, 20)));
    await store.reconcile([{ ...stroke('a', tool), points: [{ x: 0, y: 0 }, { x: 19, y: 19 }] }]);
    expect((await flatten(store)).data.every(n => Number.isFinite(n) && n === 0)).toBe(true);
  });
  it('stage ignores other domains and layer strokes, and exposes reconciliation failures on read', async () => {
    const base = pixelSource(picture(32, 32)), stage = createRetouchStage({ maxBytes: 1 });
    const source = stage.apply(base, { strokes: [{ ...stroke('a'), layer: 'layer' }, { tool: 'other-domain' }] });
    expect((await source.readTile({ level: 0, x: 0, y: 0 })).data).toEqual(picture(32, 32).data);
    stage.apply(base, { strokes: [{ ...stroke('a'), points: [{ x: 16, y: 16 }] }] });
    await expect(source.readTile({ level: 0, x: 0, y: 0 })).rejects.toThrow(RangeError);
    stage.apply(base, { strokes: [] });
    expect((await source.readTile({ level: 0, x: 0, y: 0 })).data).toEqual(picture(32, 32).data);
  });
  it('stage reads wait for reconciliation', async () => {
    const stage = createRetouchStage(), base = pixelSource(picture());
    const source = stage.apply(base, { strokes: [stroke('s')] });
    const direct = new StrokeStore(base); await direct.reconcile([stroke('s')]);
    expect((await source.readTile({ level: 0, x: 0, y: 0 })).data).toEqual((await direct.readTile({ level: 0, x: 0, y: 0 })).data);
  });
});

describe('kernel behaviour', () => {
  it('eraser scales alpha and premultiplied colour together; brush deposits associated colour', () => {
    const surface = createDabSurface({ x: 0, y: 0, width: 3, height: 3 }); surface.data.fill(1);
    const dab = { x: 1.5, y: 1.5, pressure: 1, dx: 0, dy: 0 }, ws = new DabWorkspace();
    applyDab(surface, 'eraser', { size: 3, opacity: .5, hardness: 1 }, dab, ws);
    expect(Array.from(surface.data.slice(16, 20))).toEqual([.5, .5, .5, .5]);
    applyDab(surface, 'brush', { size: 3, colour: [1, 0, 0, .5], hardness: 1 }, dab, ws);
    expect(Array.from(surface.data.slice(16, 20))).toEqual([.75, .25, .25, .75]);
  });
  it('patch respects its selection, red eye detects red, colour replacement retains luminance', () => {
    const ws = new DabWorkspace(), dab = { x: 1.5, y: 1.5, pressure: 1, dx: 0, dy: 0 };
    const surface = createDabSurface({ x: 0, y: 0, width: 3, height: 3 });
    for (let i = 0; i < surface.data.length; i += 4) surface.data.set([.8, .1, .1, 1], i);
    applyDab(surface, 'red-eye', { size: 5, hardness: 1 }, dab, ws);
    expect(surface.data[16]).toBeCloseTo(.1);
    const before = surface.data.slice();
    applyDab(surface, 'patch', { size: 5, selection: [] }, dab, ws);
    expect(surface.data).toEqual(before);
    const luminance = .2126 * surface.data[16]! + .7152 * surface.data[17]! + .0722 * surface.data[18]!;
    applyDab(surface, 'colour-replace', { size: 5, hardness: 1, strength: 1, colour: [0, .5, 0, 1] }, dab, ws);
    expect(.7152 * surface.data[17]!).toBeCloseTo(luminance);
  });
  it('clone copies associated pixels and dodge/burn honour tonal ranges', () => {
    const ws = new DabWorkspace(), surface = createDabSurface({ x: 0, y: 0, width: 4, height: 1 });
    surface.data.set([.1, .1, .1, 1, .3, .2, .1, .5, .1, .1, .1, 1, .9, .9, .9, 1]);
    applyDab(surface, 'clone', { size: 1, hardness: 1, sourceOffset: { x: 1, y: 0 } }, { x: .5, y: .5, pressure: 1, dx: 0, dy: 0 }, ws);
    expect(Array.from(surface.data.slice(0, 4))).toEqual(Array.from(surface.data.slice(4, 8)));
    const darkBefore = surface.data[8]!, lightBefore = surface.data[12]!;
    applyDab(surface, 'dodge', { size: 10, hardness: 1, tonalRange: 'shadows' }, { x: 2, y: .5, pressure: 1, dx: 0, dy: 0 }, ws);
    expect(surface.data[8]! / darkBefore).toBeGreaterThan(surface.data[12]! / lightBefore);
    const beforeBurn = surface.data[12]!;
    applyDab(surface, 'burn', { size: 10, hardness: 1, tonalRange: 'highlights' }, { x: 2, y: .5, pressure: 1, dx: 0, dy: 0 }, ws);
    expect(surface.data[12]!).toBeLessThan(beforeBurn);
  });
  it('measures complete store dabs including search, region gathering and COW', async () => {
    const timings: Record<string, number> = {};
    for (const tool of ['brush', 'heal', 'spot-heal'] as const) {
      const store = new StrokeStore(pixelSource(picture(720, 720))), strokes: Stroke[] = [], times: number[] = [];
      for (let i = 0; i < 14; i++) {
        strokes.push({ ...stroke(String(i), tool), params: { size: 100, sourceOffset: { x: 110, y: 0 } }, points: [{ x: 360, y: 360 }] });
        const start = performance.now(); await store.reconcile(strokes); if (i >= 4) times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b); timings[tool] = Number(times[5]!.toFixed(3));
    }
    console.info('CPU server complete 100 px store dab median ms:', timings);
  });
  it('measures warmed 100 px dabs on this CPU, reusing scratch buffers', () => {
    const timings: Record<string, number> = {};
    for (const tool of tools) {
      const surface = { ...picture(108, 108), x: 0, y: 0 }, ws = new DabWorkspace();
      const params = { size: 100, sourceOffset: { x: 2, y: 1 } }, dab = { x: 54, y: 54, pressure: 1, dx: 1, dy: 0 };
      for (let i = 0; i < 5; i++) applyDab(surface, tool, params, dab, ws);
      const buffer = ws.frozen, samples: number[] = [];
      for (let i = 0; i < 15; i++) {
        const start = performance.now(); applyDab(surface, tool, params, dab, ws); samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b); timings[tool] = Number(samples[7]!.toFixed(3));
      expect(ws.frozen).toBe(buffer);
    }
    console.info('CPU server 100 px dab median ms:', timings);
    const search = { ...picture(720, 720), x: 0, y: 0 }, dab = { x: 360, y: 360, pressure: 1, dx: 0, dy: 0 };
    const searchTimes: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now(); findSpotSource(search, dab, { size: 100 }); searchTimes.push(performance.now() - start);
    }
    searchTimes.sort((a, b) => a - b);
    console.info('CPU server spot-source search median ms:', Number(searchTimes[10]!.toFixed(3)));
  });
});

describe('liquify', () => {
  it('is JSON data, exact at identity, and composes without touching any pixels', () => {
    let grid = createLiquifyGrid(100, 100, 5);
    expect(mapLiquify(31.5, 72.5, grid)).toEqual([31.5, 72.5]);
    for (let i = 0; i < 10; i++) grid = liquifyDab(grid, 'push', { x: 50, y: 50, radius: 30, strength: .2, dx: 2 });
    expect(mapLiquify(50, 50, grid)[0]).toBeLessThan(50);
    const loaded = JSON.parse(JSON.stringify(grid)) as typeof grid;
    expect(liquifyWarp.map(50, 50, loaded, { width: 100, height: 100 })).toEqual(mapLiquify(50, 50, grid));
    const reset = liquifyDab(grid, 'reconstruct', { x: 50, y: 50, radius: 30, strength: 1 });
    expect(mapLiquify(50, 50, reset)).toEqual([50, 50]);
  });
  it('pucker, bloat and twirl have inverse-sampling directions', () => {
    const grid = createLiquifyGrid(100, 100, 5), dab = { x: 50, y: 50, radius: 30, strength: .5 };
    expect(mapLiquify(60, 50, liquifyDab(grid, 'shrink', dab))[0]).toBeGreaterThan(60);
    expect(mapLiquify(60, 50, liquifyDab(grid, 'expand', dab))[0]).toBeLessThan(60);
    expect(mapLiquify(60, 50, liquifyDab(grid, 'twirl', dab))[1]).toBeLessThan(50);
  });
});

it('historical read branches preserve live tiles and retained undo work', async () => {
  const base=solidSource({width:32,height:32},[0,0,0,1]),store=new StrokeStore(base);
  const one:Stroke={id:'branch-one',tool:'brush',params:{size:4,hardness:1,colour:[1,0,0,1]},points:[{x:8,y:8}]};
  const two:Stroke={...one,id:'branch-two',points:[{x:20,y:20}]};
  await store.reconcile([one]);await store.reconcile([one,two]);const work=store.stats.dabApplications;
  const branch=store.fork([]),tile={level:0,x:0,y:0};
  expect((await branch.readTile(tile)).data[(8*32+8)*4]).toBe(0);
  expect((await store.readTile(tile)).data[(8*32+8)*4]).toBe(1);
  await store.reconcile([one]);expect(store.stats.dabApplications).toBe(work);
  expect((await store.readTile(tile)).data[(20*32+20)*4]).toBe(0);
});
