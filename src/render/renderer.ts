import { abortable } from "../core/async.js";
import {
  coarsestLevel,
  fitViewport,
  levelForZoom,
  panBy,
  TILE_GUTTER,
  TILE_SIZE,
  TileCache,
  TileCacheBudget,
  tileKey,
  tileRect,
  visibleTiles,
  type ImageDocument,
  type PixelBuffer,
  type Rect,
  type TileAddress,
  type TileSource,
  type Viewport,
} from "../core/index.js";
import { composeTile, prepareTile } from "./compose.js";
import type { Draw, PresentGrid, RenderBackend, Surface, TransparencyGrid } from "./types.js";

interface Composed {
  surface: Surface;
  revision: number;
  width: number;
  height: number;
  /** Frame this tile was last shown, so it is not evicted while on screen. */
  shown: number;
}

export interface RendererOptions {
  document: ImageDocument;
  backend: RenderBackend;
  /** Straight sRGB behind the document, 0–1. Defaults to the neutral stage grey. */
  background?: readonly [number, number, number];
  /** A checkerboard under the document's bounds, which shows through transparent pixels. Off by default. */
  transparencyGrid?: TransparencyGrid | boolean;
  /** Time a frame may spend composing tiles. The rest wait for later frames. */
  frameBudgetMs?: number;
  /** Bytes of composed tiles to keep. */
  composedBudget?: number;
  /** Total bytes of decoded tiles to keep across sources. */
  tileBudget?: number;
  /** Supplies a replacement if the backend is lost, usually a `CpuBackend`. */
  fallback?: (reason: string) => RenderBackend;
  /** Called after the backend changes, so the host can show its canvas. */
  onBackendChange?: (backend: RenderBackend) => void;
  /** Called after each renderer frame; unchanged draws need no presentation. */
  onFrame?: (stats: RendererStats) => void;
  /** Called when a source refuses a tile. */
  onError?: (error: unknown) => void;
}

export interface RendererStats {
  frames: number;
  composedTiles: number;
  /** Visible/coarsest tiles missing the current revision, including invalidation between frames. Queued source edits require settle(). */
  pendingTiles: number;
  composedBytes: number;
  decodedBytes: number;
  tileReads: number;
  /** Main-thread time preparing/composing tiles in the last frame that submitted work. */
  composeMs: number;
}

const DEFAULT_BACKGROUND = [0.149, 0.149, 0.149] as const;
/** A light and a mid grey: transparency reads at once against the dark stage, and neither tints a picture's edge. */
const DEFAULT_GRID_COLOURS = [[0.8, 0.8, 0.8], [0.62, 0.62, 0.62]] as const;
const DEFAULT_GRID_SIZE = 8;
const now = () => performance.now();

/** Turns a document and a viewport into pixels, a few tiles each frame, without ever blocking. */
export class Renderer {
  backend: RenderBackend;
  #document: ImageDocument;
  #view: Viewport;
  #options: RendererOptions;
  #caches = new Map<TileSource, TileCache>();
  #composed = new Map<string, Composed>();
  #frames = 0;
  #composeMs = 0;
  #scheduled = 0;
  #unsubscribe: () => void;
  #stopLost: () => void = () => {};
  #tileBudget: TileCacheBudget;
  #disposed = false;
  #lifetime = new AbortController();
  /** A new document has nothing composed yet, so keep the old picture on screen. */
  #holding = false;
  #inflight?: { controller: AbortController; done: Promise<void> };
  #failure?: { error: unknown };
  #presented?: Draw[];

  constructor(options: RendererOptions) {
    this.#options = options;
    this.#tileBudget = new TileCacheBudget(options.tileBudget ?? 512 * 1024 * 1024);
    this.#document = options.document;
    this.backend = options.backend;
    this.#view = fitViewport(options.document, { width: 1, height: 1 });
    this.#unsubscribe = options.document.subscribe(rect => this.#changed(rect));
    this.#watch(options.backend);
  }

  get view() {
    return this.#view;
  }

  get stats(): RendererStats {
    let decodedBytes = 0;
    let tileReads = 0;
    for (const cache of this.#caches.values()) {
      decodedBytes += cache.bytes;
      tileReads += cache.reads;
    }
    return {
      frames: this.#frames,
      composedTiles: this.#composed.size,
      pendingTiles: this.#pendingTiles(),
      composedBytes: this.backend.bytes,
      decodedBytes,
      tileReads,
      composeMs: this.#composeMs,
    };
  }

  #pendingTiles(): number {
    const document = this.#document, top = coarsestLevel(document);
    const current = (tile: TileAddress) => this.#composed.get(tileKey(tile))?.revision === document.revision;
    let count = current({ level: top, x: 0, y: 0 }) ? 0 : 1;
    for (const tile of visibleTiles(document, this.#view, levelForZoom(document, this.#view.zoom))) {
      if (tile.level === top && tile.x === 0 && tile.y === 0) continue;
      if (!current(tile)) count++;
    }
    return count;
  }

  /** Show or hide the transparency grid, or change its squares, from the next frame. */
  setTransparencyGrid(grid: TransparencyGrid | boolean) {
    this.#options = { ...this.#options, transparencyGrid: grid };
    this.#presented = undefined;
    this.invalidate();
  }

  /** The grid for this frame, on the same rounding as the draws so its edge meets the picture's. */
  #grid(): PresentGrid | undefined {
    const option = this.#options.transparencyGrid;
    if (!option) return undefined;
    const { size = DEFAULT_GRID_SIZE, colours = DEFAULT_GRID_COLOURS } = option === true ? {} : option;
    const view = this.#view, document = this.#document;
    const toScreenX = (x: number) => Math.round((x - view.centerX) * view.zoom + view.width / 2);
    const toScreenY = (y: number) => Math.round((y - view.centerY) * view.zoom + view.height / 2);
    const x = toScreenX(0), y = toScreenY(0);
    const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return { rect: { x, y, width: toScreenX(document.width) - x, height: toScreenY(document.height) - y }, cell: Math.max(1, Math.round(size * ratio)), colours };
  }

  /** Show this viewport from the next frame. Resizes the canvas if its size changed. */
  setView(view: Viewport) {
    const { width, height } = this.backend.canvas;
    if (view.width !== width || view.height !== height) { this.backend.resize(view.width, view.height); this.#presented = undefined; }
    if ((this.#view.zoom >= 2) !== (view.zoom >= 2)) this.#presented = undefined;
    this.#view = view;
    this.invalidate();
  }

  /** Show another document. The last frame stays up until the new one has something to draw. */
  setDocument(document: ImageDocument) {
    this.#unsubscribe();
    this.#clear();
    this.#document = document;
    const retained=new Set(document.layers.map(layer=>layer.source));
    for(const [source,cache] of this.#caches) if(!retained.has(source)) {cache.dispose();this.#caches.delete(source);}
    this.#unsubscribe = document.subscribe(rect => this.#changed(rect));
    this.#holding = true;
    this.invalidate();
  }

  #changed(rect?: Rect) {
    this.#cancelComposition();
    this.#failure = undefined;
    if (rect) {
      for (const [key, entry] of this.#composed) {
        const [level,x,y]=key.split("/").map(Number) as [number,number,number];
        const scale=2**level;
        const padding=Math.max(0,...this.#document.layers.map(layer=>layer.filters.reduce((n,{filter,params})=>n+filter.padding(params,1/scale),0)))+TILE_GUTTER;
        const area=tileRect(this.#document,{level,x,y});
        if ((area.x-padding)*scale < rect.x+rect.width && (area.y-padding)*scale < rect.y+rect.height &&
            (area.x+area.width+padding)*scale > rect.x && (area.y+area.height+padding)*scale > rect.y) {
          // Keep the old surface to draw until the replacement arrives.
          entry.revision=-1;
        } else if(entry.revision>=0) entry.revision=this.#document.revision;
      }
      for(const cache of this.#caches.values()) cache.invalidate(rect);
    } else {
      for(const entry of this.#composed.values()) entry.revision=-1;
    }
    this.invalidate();
  }

  /** Move by device pixels. */
  panBy(dx: number, dy: number) {
    this.setView(panBy(this.#view, dx, dy));
  }

  /** Ask for a frame. Safe to call any number of times between frames. */
  invalidate() {
    if (this.#scheduled || this.#disposed || typeof requestAnimationFrame === "undefined") return;
    this.#scheduled = requestAnimationFrame(() => {
      this.#scheduled = 0;
      this.frame();
    });
  }

  /** Compose what the budget allows, then draw. Tiles not ready draw from a coarser level. */
  frame(budgetMs = this.#options.frameBudgetMs ?? 8) {
    if (this.#disposed) return;
    this.#frames++;
    const document = this.#document;
    const level = levelForZoom(document, this.#view.zoom);
    const tiles = visibleTiles(document, this.#view, level);
    const coarsest: TileAddress = { level: coarsestLevel(document), x: 0, y: 0 };

    const start = now();
    let pending = 0;
    let composedAny = false;
    for (const tile of [coarsest, ...tiles]) {
      const entry = this.#composed.get(tileKey(tile));
      if (entry?.revision === document.revision) continue;
      if (composedAny && now() - start >= budgetMs) {
        pending++;
        continue;
      }
      const previousWork = this.#inflight;
      if (this.#compose(tile)) composedAny = true;
      else {
        pending++;
        if (this.#inflight !== previousWork) composedAny = true;
      }
    }
    if (composedAny) this.#composeMs = now() - start;

    const draws = this.#draws(tiles);
    if (draws.length > 0) this.#holding = false;
    if (!this.#holding && !sameDraws(this.#presented, draws)) {
      this.#presented = draws;
      this.backend.present(draws, {
        background: this.#options.background ?? DEFAULT_BACKGROUND,
        pixelated: this.#view.zoom >= 2,
        grid: this.#grid(),
      });
    }
    this.#trim();
    this.#options.onFrame?.(this.stats);
    if (pending > 0 && !this.#failure) this.invalidate();
  }

  /** Wait for queued source edits, then compose everything visible, yielding between frame budgets. */
  async settle() {
    for (;;) {
      this.#lifetime.signal.throwIfAborted();
      await abortable(Promise.all(this.#document.layers.filter(layer => layer.visible).map(layer => layer.source.idle?.(this.#lifetime.signal))), this.#lifetime.signal);
      this.#lifetime.signal.throwIfAborted();
      const animated = typeof requestAnimationFrame === "function" && (typeof document === "undefined" || !document.hidden);
      if (animated) {
        // Share the normal presentation cadence; do not enqueue extra GPU presentations
        // between animation frames while a test or host waits for completion.
        this.invalidate();
        await abortable(new Promise<void>(resolve => requestAnimationFrame(() => resolve())), this.#lifetime.signal);
      } else this.frame();
      this.#lifetime.signal.throwIfAborted();
      if (this.#inflight) {
        await abortable(this.#inflight.done, this.#lifetime.signal);
        if (this.#failure) throw this.#failure.error;
        // Headless/custom CPU composition may resolve synchronously. A microtask alone cannot
        // yield to timers or cancellation; retain the frame budget's task boundary there too.
        if (!animated) await new Promise<void>(resolve => setTimeout(resolve, 0));
        continue; // Present the completed worker surface on the next budgeted frame.
      }
      if (this.#failure) throw this.#failure.error;
      if (this.#pendingTiles() === 0) return;
      await abortable(Promise.all([...this.#caches.values()].map((cache) => cache.idle(this.#lifetime.signal))), this.#lifetime.signal);
      if (!animated) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  /** A composed tile's pixels without its gutter, or undefined if it is not composed. */
  readTile(tile: TileAddress): PixelBuffer | undefined {
    const entry = this.#composed.get(tileKey(tile));
    if (!entry) return undefined;
    const full = this.backend.read(entry.surface);
    const { width, height } = entry;
    const data = new Float32Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      const from = ((row + TILE_GUTTER) * full.width + TILE_GUTTER) * 4;
      data.set(full.data.subarray(from, from + width * 4), row * width * 4);
    }
    return { width, height, data };
  }

  dispose() {
    this.#disposed = true;
    this.#lifetime.abort(new Error("Renderer disposed"));
    if (this.#scheduled) cancelAnimationFrame(this.#scheduled);
    this.#unsubscribe();
    this.#stopLost();
    this.#clear();
    for(const cache of this.#caches.values()) cache.dispose();
    this.#caches.clear();
    this.backend.dispose();
  }

  #watch(backend: RenderBackend) {
    this.#stopLost();
    this.#stopLost = backend.onLost((reason) => {
      // The surfaces went with the context, so there is nothing to release.
      this.#cancelComposition();
      this.#composed.clear();
      this.#presented = undefined;
      const next = this.#options.fallback?.(reason);
      if (!next) return;
      const { width, height } = this.#view;
      this.backend = next;
      next.resize(width, height);
      this.#watch(next);
      this.#options.onBackendChange?.(next);
      this.invalidate();
    });
  }

  #cancelComposition() {
    this.#inflight?.controller.abort(new Error("Tile composition superseded"));
    this.#inflight = undefined;
  }

  #clear() {
    this.#cancelComposition();
    this.#failure = undefined;
    this.#presented = undefined;
    for (const { surface } of this.#composed.values()) this.backend.release(surface);
    this.#composed.clear();
  }

  #cache(source: TileSource) {
    let cache = this.#caches.get(source);
    if (!cache) {
      cache = new TileCache(source, this.#tileBudget);
      cache.onLoad = () => this.invalidate();
      cache.onError = (error) => this.#options.onError?.(error);
      this.#caches.set(source, cache);
    }
    return cache;
  }

  /** Compose one tile. False means its pixels have not arrived, and have been requested. */
  #compose(tile: TileAddress): boolean {
    const document = this.#document;
    if (this.#failure || this.#inflight) return false;
    const backend = this.backend;
    if (backend.compose) {
      const job = prepareTile(document, tile, source => this.#cache(source));
      if (!job) return false;
      const revision = document.revision, controller = new AbortController();
      const work = { controller, done: Promise.resolve() };
      this.#inflight = work;
      work.done = backend.compose(job, controller.signal).then(surface => {
        if (controller.signal.aborted || this.#disposed || this.#document !== document || document.revision !== revision || this.backend !== backend) backend.release(surface);
        else this.#store(tile, surface);
      }).catch(error => {
        if (!controller.signal.aborted) { this.#failure = { error }; this.#options.onError?.(error); }
      }).finally(() => {
        if (this.#inflight === work) this.#inflight = undefined;
        this.invalidate();
      });
      return false;
    }
    const surface = composeTile(backend, document, tile, source => this.#cache(source));
    if (!surface) return false;
    this.#store(tile, surface);
    return true;
  }

  #store(tile: TileAddress, surface: Surface) {
    const document = this.#document;
    const inner = tileRect(document, tile);
    const key = tileKey(tile);
    const previous = this.#composed.get(key);
    if (previous) this.backend.release(previous.surface);
    this.#composed.delete(key);
    this.#composed.set(key, { surface, revision: document.revision, width: inner.width, height: inner.height, shown: this.#frames });
  }

  /** One draw for each visible tile: its own pixels, or the matching piece of a coarser tile. */
  #draws(tiles: TileAddress[]): Draw[] {
    const document = this.#document;
    const view = this.#view;
    const toScreenX = (x: number) => Math.round((x - view.centerX) * view.zoom + view.width / 2);
    const toScreenY = (y: number) => Math.round((y - view.centerY) * view.zoom + view.height / 2);
    const top = coarsestLevel(document);
    const draws: Draw[] = [];

    for (const tile of tiles) {
      const rect = tileRect(document, tile);
      const size = 2 ** tile.level;
      const left = rect.x * size;
      const right = Math.min(document.width, (rect.x + rect.width) * size);
      const upper = rect.y * size;
      const lower = Math.min(document.height, (rect.y + rect.height) * size);
      const target: Rect = { x: toScreenX(left), y: toScreenY(upper), width: toScreenX(right) - toScreenX(left), height: toScreenY(lower) - toScreenY(upper) };
      if (target.width <= 0 || target.height <= 0) continue;

      for (let level = tile.level; level <= top; level++) {
        const shift = level - tile.level;
        const holder = { level, x: tile.x >> shift, y: tile.y >> shift };
        const entry = this.#composed.get(tileKey(holder));
        if (!entry) continue;
        entry.shown = this.#frames;
        const fraction = 2 ** -shift;
        draws.push({
          surface: entry.surface,
          source: {
            x: TILE_GUTTER + (rect.x * fraction - holder.x * TILE_SIZE),
            y: TILE_GUTTER + (rect.y * fraction - holder.y * TILE_SIZE),
            width: rect.width * fraction,
            height: rect.height * fraction,
          },
          target,
        });
        break;
      }
    }
    return draws;
  }

  #trim() {
    const budget = this.#options.composedBudget ?? 512 * 1024 * 1024;
    const fallback = tileKey({ level: coarsestLevel(this.#document), x: 0, y: 0 });
    for (const [key, entry] of this.#composed) {
      if (this.backend.bytes <= budget) return;
      // The mandatory fallback and visible tiles form the minimum working set.
      if (entry.shown === this.#frames || key === fallback) continue;
      this.backend.release(entry.surface);
      this.#composed.delete(key);
    }
  }
}

/** Pending source/worker tiles must not resubmit an unchanged full viewport to the graphics process. */
function sameDraws(previous: readonly Draw[] | undefined, next: readonly Draw[]) {
  return previous?.length === next.length && next.every((draw, i) => {
    const before = previous[i]!;
    return before.surface === draw.surface && sameRect(before.source, draw.source) && sameRect(before.target, draw.target);
  });
}
function sameRect(a: Rect, b: Rect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
