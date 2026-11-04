import { abortable, retryRead } from "../core/async.js";
import { TILE_SIZE, type PixelBuffer } from '../core/pixels.js';
import { tileKey, tileRect, tilesInRect, coarsestLevel, type Rect, type TileAddress } from '../core/pyramid.js';
import type { TileSource } from '../core/tile-source.js';
import { applyDabSteps, DabWorkspace, findSpotSource, type DabSurface } from './kernels.js';
import { dabRect, strokeDabs, type Stroke } from './stroke.js';

class StaleRetouchRead extends Error {}
type Tiles = Map<string, PixelBuffer>;
interface Snapshot { strokes: readonly Stroke[]; tiles: Tiles }
/** Worker scheduling and retained tile/history limits. */
export interface StrokeStoreOptions {
  /** Retained tile bytes, including history and mip cache; default 64 MiB. Scratch is separate. */
  maxBytes?: number;
  /** Maximum retained history snapshots (metadata bound); default 128. */
  maxSnapshots?: number;
  /** Cooperative worker scheduling between dabs; default yields to the task queue every 8 ms. */
  yield?: () => Promise<void>;
}
const copy = (p: PixelBuffer): PixelBuffer => ({ width: p.width, height: p.height, data: p.data.slice() });
const intersect = (r: Rect, width: number, height: number): Rect => {
  const x = Math.max(0, r.x), y = Math.max(0, r.y);
  return { x, y, width: Math.max(0, Math.min(width, r.x + r.width) - x), height: Math.max(0, Math.min(height, r.y + r.height) - y) };
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.y < b.y + b.height && b.x < a.x + a.width && b.y < a.y + a.height;
const same = (a: Stroke, b: Stroke) => a === b || JSON.stringify(a) === JSON.stringify(b);
const prefix = (a: readonly Stroke[], b: readonly Stroke[]) => a.length <= b.length && a.every((s, i) => same(s, b[i]!));

/** Which strokes a store replays: the base picture's, or one layer's pixels or mask. */
export interface StrokeTarget {
  /** Layer id; absent for the base picture. */ layer?: string;
  /** The layer's mask rather than its pixels. */ mask?: boolean;
}
/** Cumulative CPU work, useful for replay and dirty-region proofs. */
export interface StrokeStoreStats {
  /** Number of pixel dab applications, including replay. */ dabApplications: number;
  /** Number of full or partial mip tile rebuilds. */ downsampledTiles: number;
  /** Times a single dab paused part-way to keep within the budget. */ dabPauses: number;
}

/**
 * Sparse COW tile source. Snapshots share untouched tiles; a retained undo applies zero dabs.
 * Read-through base tiles, oldest history snapshots, then mip entries are evicted at the limit. Undo beyond
 * retained history replays from the base (or a retained prefix). If current edited tiles alone
 * exceed the limit, reconciliation rejects atomically with RangeError; it never drops edits.
 * The bound covers retained pixel storage, not base-owned tiles, stroke data or transient scratch.
 * Read buffers are borrowed, immutable. Base must remain immutable for this store's lifetime.
 */
export class StrokeStore implements TileSource {
  /** Source width in pixels. */
  readonly width: number;
  /** Source height in pixels. */
  readonly height: number;
  /** Cumulative work counters for tests and host diagnostics. */
  readonly stats: StrokeStoreStats = { dabApplications: 0, downsampledTiles: 0, dabPauses: 0 };
  private tiles: Tiles = new Map();
  private snapshots: Snapshot[] = [];
  private strokes: readonly Stroke[] = [];
  private mips: Tiles = new Map();
  private mipDirty = new Map<string, Rect>();
  private originals: Tiles = new Map();
  private listeners = new Set<(rect: Rect) => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private ready: Promise<unknown> = Promise.resolve();
  private stageMode = false;
  private ownedStrokes = new WeakMap<Stroke, Stroke>();
  private workspace = new DabWorkspace();
  private regionData = new Float32Array(0);
  private sampleData = new Float32Array(0);
  private readonly maxBytes: number;
  private mipDeadline = 0;
  private revision = 0;
  /** Wrap an immutable base with sparse editable tiles. */
  constructor(/** Immutable decoded input. */ readonly base: TileSource, private options: StrokeStoreOptions = {}, /** Strokes this store accepts. */ readonly target: StrokeTarget = {}) {
    this.width = base.width; this.height = base.height;
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
    if (!(this.maxBytes >= 0)) throw new RangeError('Invalid tile memory limit');
  }
  /** Subscribe to changed, full-resolution source rectangles. */
  invalidated = (listener: (rect: Rect) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  /** Unique retained pixel bytes, including read-through, history and mip caches. */
  get retainedBytes(): number {
    const unique = new Set<PixelBuffer>(this.tiles.values());
    for (const s of this.snapshots) for (const p of s.tiles.values()) unique.add(p);
    for (const p of this.mips.values()) unique.add(p);
    for (const p of this.originals.values()) unique.add(p);
    let bytes = 0; for (const p of unique) bytes += p.data.byteLength;
    return bytes;
  }
  private trim() {
    while (this.retainedBytes > this.maxBytes && this.originals.size) this.originals.delete(this.originals.keys().next().value!);
    while (this.retainedBytes > this.maxBytes && this.snapshots.length) this.snapshots.shift();
    while (this.retainedBytes > this.maxBytes && this.mips.size) { const key = this.mips.keys().next().value!; this.mips.delete(key); this.mipDirty.delete(key); }
  }
  /** Serialises concurrent edits; the returned rectangles are clipped source coordinates. */
  reconcile(strokes: readonly Stroke[]): Promise<Rect[]> {
    // Recipes and stroke objects are immutable. Clone new payloads once, reuse by reference thereafter.
    const owned = strokes.map(stroke => {
      let copy = this.ownedStrokes.get(stroke);
      if (!copy) { copy = structuredClone(stroke); this.ownedStrokes.set(stroke, copy); }
      return copy;
    });
    const job = this.tail.then(() => this.update(owned));
    this.ready = job;
    this.tail = job.catch(() => {});
    return job;
  }
  /** An independent read branch sharing immutable COW snapshots, never reconciling the live store. */
  fork(strokes: readonly Stroke[]): StrokeStore {
    const branch = new StrokeStore(this.base, this.options, this.target);
    branch.stageMode = true;
    const owned = strokes.map(stroke => {
      let copy = this.ownedStrokes.get(stroke);
      if (!copy) { copy = structuredClone(stroke); this.ownedStrokes.set(stroke, copy); }
      return copy;
    });
    const job = this.tail.then(async () => {
      branch.snapshots = [...this.snapshots, {strokes:this.strokes, tiles:this.tiles}];
      await branch.update(owned);
    });
    branch.ready = job;
    branch.tail = job.catch(() => {});
    return branch;
  }
  private async readBase(address: TileAddress): Promise<PixelBuffer> {
    const key = tileKey(address), cached = this.originals.get(key);
    if (cached) { this.originals.delete(key); this.originals.set(key, cached); return cached; }
    const pixels = await this.base.readTile(address);
    this.originals.set(key, pixels); this.trim(); return pixels;
  }
  private async region(rect: Rect, tiles: Tiles, sampled = false): Promise<DabSurface> {
    const length = rect.width * rect.height * 4;
    let data = sampled ? this.sampleData : this.regionData;
    if (data.length < length) {
      data = new Float32Array(length);
      if (sampled) this.sampleData = data; else this.regionData = data;
    }
    const view = data.subarray(0, length); view.fill(0);
    for (const address of tilesInRect(this, 0, rect)) {
      const tr = tileRect(this, address), p = tiles.get(tileKey(address)) ?? await this.readBase(address);
      const x0 = Math.max(tr.x, rect.x), x1 = Math.min(tr.x + tr.width, rect.x + rect.width);
      const y0 = Math.max(tr.y, rect.y), y1 = Math.min(tr.y + tr.height, rect.y + rect.height);
      for (let y = y0; y < y1; y++) {
        const start = ((y - tr.y) * p.width + x0 - tr.x) * 4;
        view.set(p.data.subarray(start, start + (x1 - x0) * 4), ((y - rect.y) * rect.width + x0 - rect.x) * 4);
      }
    }
    return { ...rect, data: view };
  }
  private async update(next: readonly Stroke[]): Promise<Rect[]> {
    if (next.length === this.strokes.length && prefix(next, this.strokes)) return [];
    // Only the changed suffix contributes invalidation, even when replay needs an older snapshot.
    let common = 0;
    while (common < next.length && common < this.strokes.length && same(next[common]!, this.strokes[common]!)) common++;
    const oldLast = this.strokes[common], newLast = next[common];
    const extending = common === next.length - 1 && next.length === this.strokes.length && oldLast && newLast &&
      oldLast.id === newLast.id && oldLast.tool === newLast.tool && oldLast.layer === newLast.layer &&
      JSON.stringify(oldLast.params) === JSON.stringify(newLast.params) &&
      oldLast.points.length <= newLast.points.length && oldLast.points.every((p, i) => JSON.stringify(p) === JSON.stringify(newLast.points[i]));
    const skipDabs = extending ? [...strokeDabs(oldLast)].length : 0;
    const dirty: Rect[] = [];
    for (const s of extending ? [newLast] : [...this.strokes.slice(common), ...next.slice(common)]) {
      let dabIndex = 0;
      for (const dab of strokeDabs(s)) {
        if (extending && dabIndex++ < skipDabs) continue;
        const r = intersect(dabRect(dab, s.params.size), this.width, this.height);
        if (r.width && r.height) dirty.push(r);
      }
    }
    let start: Snapshot = { strokes: [], tiles: new Map() };
    for (const snapshot of [...this.snapshots, { strokes: this.strokes, tiles: this.tiles }]) {
      if (snapshot.strokes.length >= start.strokes.length && prefix(snapshot.strokes, next)) start = snapshot;
    }
    if (extending) start = { strokes: next.slice(0, common), tiles: this.tiles };
    let working = new Map(start.tiles);
    const added: Snapshot[] = [];
    let deadline = performance.now() + 8;
    for (let n = start.strokes.length; n < next.length; n++) {
      const stroke = next[n]!;
      if (stroke.layer !== this.target.layer || Boolean(stroke.mask) !== Boolean(this.target.mask)) throw new RangeError('Route layer and mask strokes to their own StrokeStore');
      working = new Map(working);
      const copied = new Set<string>();
      let dabIndex = 0;
      for (const dab of strokeDabs(stroke)) {
        if (extending && n === common && dabIndex++ < skipDabs) continue;
        const changed = intersect(dabRect(dab, stroke.params.size), this.width, this.height);
        if (!changed.width || !changed.height) continue;
        const halo = intersect({ x: changed.x - 2, y: changed.y - 2, width: changed.width + 4, height: changed.height + 4 }, this.width, this.height);
        const surface = await this.region(halo, working);
        let offset = stroke.tool === 'smudge' ? { x: -dab.dx, y: -dab.dy } : stroke.params.sourceOffset ?? { x: 0, y: 0 };
        let sampled = surface;
        if (stroke.tool === 'spot-heal') {
          const reach = Math.max(stroke.params.size, stroke.params.searchRadius ?? stroke.params.size * 3);
          const search = await this.region(intersect({ x: halo.x - Math.ceil(reach), y: halo.y - Math.ceil(reach), width: halo.width + 2 * Math.ceil(reach), height: halo.height + 2 * Math.ceil(reach) }, this.width, this.height), working, true);
          offset = findSpotSource(search, dab, stroke.params);
          sampled = search;
        } else if (['clone', 'heal', 'patch', 'smudge'].includes(stroke.tool)) {
          // Clamp source region at the image edge; the sampler repeats the last pixel.
          const sx = Math.max(0, Math.min(this.width - 1, Math.floor(halo.x + offset.x)));
          const sy = Math.max(0, Math.min(this.height - 1, Math.floor(halo.y + offset.y)));
          sampled = await this.region({ x: sx, y: sy, width: Math.max(1, Math.min(this.width, Math.ceil(halo.x + halo.width + offset.x)) - sx), height: Math.max(1, Math.min(this.height, Math.ceil(halo.y + halo.height + offset.y)) - sy) }, working, true);
        }
        // A large dab pauses part-way within the same budget, so it never holds a frame.
        const steps = applyDabSteps(surface, stroke.tool, stroke.params, dab, this.workspace, sampled, offset);
        while (!steps.next().done) {
          if (performance.now() < deadline) continue;
          this.stats.dabPauses++;
          await (this.options.yield?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
          deadline = performance.now() + 8;
        }
        this.stats.dabApplications++;
        for (const address of tilesInRect(this, 0, changed)) {
          const key = tileKey(address), tr = tileRect(this, address);
          let tile = working.get(key);
          if (!copied.has(key)) { tile = copy(tile ?? await this.readBase(address)); working.set(key, tile); copied.add(key); }
          const x0 = Math.max(changed.x, tr.x), x1 = Math.min(changed.x + changed.width, tr.x + tr.width);
          const y0 = Math.max(changed.y, tr.y), y1 = Math.min(changed.y + changed.height, tr.y + tr.height);
          for (let y = y0; y < y1; y++) {
            const i = ((y - surface.y) * surface.width + x0 - surface.x) * 4;
            tile!.data.set(surface.data.subarray(i, i + (x1 - x0) * 4), ((y - tr.y) * tile!.width + x0 - tr.x) * 4);
          }
        }
        let bytes = 0; for (const p of working.values()) bytes += p.data.byteLength;
        if (bytes > this.maxBytes) throw new RangeError('Edited tiles exceed StrokeStore maxBytes');
        if (performance.now() >= deadline) {
          await (this.options.yield?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
          deadline = performance.now() + 8;
        }
      }
      added.push({ strokes: next.slice(0, n + 1), tiles: working });
      // Do not retain unbounded transient history during a large import.
      let total = 0;
      for (let i = added.length - 1; i >= 0; i--) {
        for (const p of added[i]!.tiles.values()) total += p.data.byteLength;
        if (total > this.maxBytes) { added.splice(0, i + 1); break; }
      }
    }
    this.snapshots.push({ strokes: this.strokes, tiles: this.tiles }, ...added);
    this.snapshots = this.snapshots.slice(-Math.max(1, this.options.maxSnapshots ?? 128));
    this.tiles = working; this.strokes = next;
    for (const [key] of this.mips) {
      const [level, x, y] = key.split('/').map(Number) as [number, number, number];
      const r = tileRect(this, { level, x, y }), scale = 2 ** level;
      for (const d of dirty) if (overlaps(d, { x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale })) {
        const next = { x: Math.max(r.x, Math.floor(d.x / scale)), y: Math.max(r.y, Math.floor(d.y / scale)), width: 0, height: 0 };
        const right = Math.min(r.x + r.width, Math.ceil((d.x + d.width) / scale)), bottom = Math.min(r.y + r.height, Math.ceil((d.y + d.height) / scale));
        const previous = this.mipDirty.get(key);
        next.width = right - next.x; next.height = bottom - next.y;
        if (previous) {
          const x0 = Math.min(previous.x, next.x), y0 = Math.min(previous.y, next.y);
          this.mipDirty.set(key, { x: x0, y: y0, width: Math.max(previous.x + previous.width, right) - x0, height: Math.max(previous.y + previous.height, bottom) - y0 });
        } else this.mipDirty.set(key, next);
      }
    }
    this.trim(); this.revision++;
    for (const r of dirty) for (const listener of this.listeners) listener(r);
    return dirty;
  }
  /** Wait until queued reconciliations have published their dirty rectangles. */
  async idle(signal?: AbortSignal): Promise<void> {
    for (let attempt=0;;attempt++) {
      if (attempt) await retryRead(attempt, signal);
      const ready = this.ready;
      await abortable(ready, signal);
      if (ready === this.ready) return;
    }
  }
  /** Read a borrowed immutable tile; edits take priority over obsolete coarse reads. */
  async readTile(address: TileAddress, signal?: AbortSignal): Promise<PixelBuffer> {
    for (let attempt=0;;attempt++) {
      if (attempt) await retryRead(attempt, signal);
      const ready = this.ready;
      if (this.stageMode) await abortable(ready, signal); else await abortable(ready.catch(() => {}), signal);
      const revision = this.revision;
      this.mipDeadline = performance.now() + 4;
      try {
        const pixels = await abortable(this.read(address, revision), signal);
        if (revision === this.revision) return pixels;
      } catch (error) { if (!(error instanceof StaleRetouchRead)) throw error; }
    }
  }
  /** Stage reads must surface an asynchronous reconciliation failure. */
  reconcileStage(strokes: readonly Stroke[]): void {
    this.stageMode = true;
    void this.reconcile(strokes).catch(() => {});
  }
  private async read(address: TileAddress, revision: number): Promise<PixelBuffer> {
    if (revision !== this.revision) throw new StaleRetouchRead();
    const key = tileKey(address);
    if (address.level === 0) return this.tiles.get(key) ?? this.readBase(address);
    if (address.level > coarsestLevel(this)) throw new RangeError('Invalid pyramid level');
    const cached = this.mips.get(key), pending = this.mipDirty.get(key);
    if (cached && !pending) return cached;
    const rect = tileRect(this, address), scale = 2 ** address.level;
    const sourceRect = { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
    const edited = tilesInRect(this, 0, sourceRect).filter(tile => this.tiles.has(tileKey(tile)));
    if (!edited.length) { this.mips.delete(key); this.mipDirty.delete(key); return this.readBase(address); }
    let area: Rect;
    if (cached && pending) area = pending;
    else {
      // On a cold read seed from the base mip, then rebuild only edited descendants.
      const left = Math.max(rect.x, Math.min(...edited.map(tile => tile.x * TILE_SIZE / scale)));
      const top = Math.max(rect.y, Math.min(...edited.map(tile => tile.y * TILE_SIZE / scale)));
      const right = Math.min(rect.x + rect.width, Math.max(...edited.map(tile => (tile.x + 1) * TILE_SIZE / scale)));
      const bottom = Math.min(rect.y + rect.height, Math.max(...edited.map(tile => (tile.y + 1) * TILE_SIZE / scale)));
      area = { x: Math.floor(left), y: Math.floor(top), width: Math.ceil(right) - Math.floor(left), height: Math.ceil(bottom) - Math.floor(top) };
    }
    const out = copy(cached ?? await this.readBase(address));
    for (const child of tilesInRect(this, address.level - 1, { x: area.x * 2, y: area.y * 2, width: area.width * 2, height: area.height * 2 })) {
      const pixels = await this.read(child, revision);
      if (revision !== this.revision) throw new StaleRetouchRead();
      const ox = child.x * (TILE_SIZE / 2), oy = child.y * (TILE_SIZE / 2);
      const left = Math.max(area.x, ox), top = Math.max(area.y, oy), right = Math.min(area.x + area.width, ox + Math.ceil(pixels.width / 2)), bottom = Math.min(area.y + area.height, oy + Math.ceil(pixels.height / 2));
      for (let y = top; y < bottom; y++) {
        const sy = (y - oy) * 2, by = Math.min(sy + 1, pixels.height - 1);
        for (let x = left; x < right; x++) {
          const sx = (x - ox) * 2, rx = Math.min(sx + 1, pixels.width - 1), o = ((y - rect.y) * out.width + x - rect.x) * 4;
          for (let c = 0; c < 4; c++) out.data[o + c] = (pixels.data[(sy * pixels.width + sx) * 4 + c]! + pixels.data[(sy * pixels.width + rx) * 4 + c]! + pixels.data[(by * pixels.width + sx) * 4 + c]! + pixels.data[(by * pixels.width + rx) * 4 + c]!) / 4;
        }
        if (y % 8 === 7 && performance.now() >= this.mipDeadline) {
          await (this.options.yield?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
          this.mipDeadline = performance.now() + 4;
          if (revision !== this.revision) throw new StaleRetouchRead();
        }
      }
    }
    if (revision !== this.revision) throw new StaleRetouchRead();
    this.mipDirty.delete(key);
    this.stats.downsampledTiles++;
    this.mips.set(key, out); this.trim(); return out;
  }
}

const RETOUCH_TOOLS = new Set(['brush', 'eraser', 'clone', 'heal', 'spot-heal', 'patch', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'colour-replace', 'red-eye']);
/** The strokes one store replays, in order. */
export function strokesFor(strokes: readonly Stroke[], target: StrokeTarget): Stroke[] {
  return strokes.filter(stroke => stroke.layer === target.layer && Boolean(stroke.mask) === Boolean(target.mask) && RETOUCH_TOOLS.has(stroke.tool));
}
interface LiveStore { store: StrokeStore; target: StrokeTarget }
const keyOf = (target: StrokeTarget) => target.layer === undefined ? '' : `${target.layer}${target.mask ? '#mask' : ''}`;

/**
 * SourceStage shape, without importing the session or React. Caches are scoped to session and base
 * identity. The base picture, each layer's pixels and each layer's mask have their own store.
 */
export function createRetouchStage(options: StrokeStoreOptions = {}) {
  const owners = new WeakMap<object, WeakMap<TileSource, Map<string, StrokeStore>>>();
  const standalone = {};
  const sessions = new WeakMap<object, Map<string, LiveStore>>();
  const ownerOf = (session: unknown) => session && typeof session === 'object' ? session : standalone;
  const existing = (owner: object, base: TileSource, target: StrokeTarget) => owners.get(owner)?.get(base)?.get(keyOf(target));
  const storeFor = (owner: object, base: TileSource, target: StrokeTarget) => {
    let stores = owners.get(owner);
    if (!stores) { stores = new WeakMap(); owners.set(owner, stores); }
    let byTarget = stores.get(base);
    if (!byTarget) { byTarget = new Map(); stores.set(base, byTarget); }
    let store = byTarget.get(keyOf(target));
    if (!store) { store = new StrokeStore(base, options, target); byTarget.set(keyOf(target), store); }
    return store;
  };
  const live = (session: unknown, target: StrokeTarget, store: StrokeStore) => {
    if (!session || typeof session !== 'object') return;
    let stores = sessions.get(session);
    if (!stores) { stores = new Map(); sessions.set(session, stores); }
    stores.set(keyOf(target), { store, target });
  };
  return {
    id: 'retouch',
    /** Release all live/history stores owned by a session. */
    release(session: object) { owners.delete(session); sessions.delete(session); },
    /** Apply ephemeral pixel previews directly to tiles, without publishing recipe state each frame. */
    preview(session: object, strokes: readonly Stroke[]): Promise<Rect[]> {
      const stores = sessions.get(session);
      if (!stores?.has('')) return Promise.reject(new Error('Register the retouch stage before previewing'));
      return Promise.all([...stores.values()].map(({ store, target }) => store.reconcile(strokesFor(strokes, target)))).then(rects => rects.flat());
    },
    apply(base: TileSource, recipe: { strokes?: readonly unknown[]; layers?: readonly { id: string; mask?: unknown }[] }, _session?: unknown, context?: {isolated?: boolean}): TileSource {
      const store = storeFor(ownerOf(_session), base, {});
      // Reads wait for this queued reconciliation; hosts can use store.reconcile for error reporting.
      const strokes = strokesFor((recipe.strokes ?? []) as readonly Stroke[], {});
      if (context?.isolated) return store.fork(strokes);
      live(_session, {}, store);
      // Layers and masks that are gone no longer take part in previews.
      const stores = _session && typeof _session === 'object' ? sessions.get(_session) : undefined;
      if (stores) {
        const layers = new Map((recipe.layers ?? []).map(layer => [layer.id, layer]));
        for (const [key, { target }] of stores) if (target.layer !== undefined && (!layers.has(target.layer) || (target.mask && !layers.get(target.layer)!.mask))) stores.delete(key);
      }
      store.reconcileStage(strokes);
      return store;
    },
    /** Replay strokes aimed at one layer's pixels, or at its mask, in the layer's own pixels. */
    applyLayer(pixels: TileSource, layer: { id: string }, recipe: { strokes?: readonly unknown[] }, _session?: unknown, context?: {isolated?: boolean; mask?: boolean}): TileSource {
      const target: StrokeTarget = { layer: layer.id, ...(context?.mask ? { mask: true } : {}) }, owner = ownerOf(_session);
      const strokes = strokesFor((recipe.strokes ?? []) as readonly Stroke[], target);
      // A layer nobody has painted keeps its own source, at no cost.
      if (!strokes.length && !existing(owner, pixels, target)) return pixels;
      const store = storeFor(owner, pixels, target);
      if (context?.isolated) return store.fork(strokes);
      live(_session, target, store);
      store.reconcileStage(strokes);
      return store;
    },
  };
}
