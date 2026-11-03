import { abortable, retryRead } from "./async.js";
import { createPixels, TILE_SIZE, type PixelBuffer } from "./pixels.js";
import { levelSize, tileKey, tileRect, tilesInRect, type Rect, type Size, type TileAddress } from "./pyramid.js";
import type { TileSource } from "./tile-source.js";

class CacheDisposedError extends Error {}

const BYTES_PER_FLOAT = 4;
const bytesOf = (pixels: PixelBuffer) => pixels.data.length * BYTES_PER_FLOAT;

/** One retained-pixel allowance shared by a set of caches. */
export class TileCacheBudget {
  #caches = new Set<TileCache>();
  constructor(readonly bytes: number) {}
  get share() { return this.bytes / Math.max(1,this.#caches.size); }
  add(cache: TileCache) { this.#caches.add(cache); for(const member of this.#caches) member.trimToBudget(); }
  delete(cache: TileCache) { this.#caches.delete(cache); }
}

/**
 * Holds decoded tiles under a byte budget, dropping the least recently used. Memory follows what
 * has been looked at, not the size of the document.
 */
export class TileCache {
  #tiles = new Map<string, PixelBuffer>();
  #loading = new Map<string, Promise<void>>();
  #failures = new Map<string, unknown>();
  #lifetime = new AbortController();
  #bytes = 0;
  #disposed = false;
  #versions = new Map<string, number>();
  #listeners = new Set<(rect: Rect) => void>();
  #stop: (() => void) | undefined;
  /** Tiles read from the source since this cache was made. */
  reads = 0;
  /** Called when a tile requested with `request` has arrived. */
  onLoad?: () => void;
  /** Called once when a source refuses a tile. Invalidate its rectangle to allow a retry. */
  onError?: (error: unknown, tile: TileAddress) => void;

  constructor(
    readonly source: TileSource,
    private allowance: number | TileCacheBudget = 512 * 1024 * 1024,
  ) {
    if(allowance instanceof TileCacheBudget) allowance.add(this);
    this.#stop = source.invalidated?.(rect => this.invalidate(rect));
  }
  /** This cache’s current share of the retained-pixel allowance. */
  get budget() {return typeof this.allowance === "number" ? this.allowance : this.allowance.share;}

  /** Forget intersecting tiles at every level, including pending reads. */
  invalidate(rect: Rect) {
    for (const key of new Set([...this.#tiles.keys(), ...this.#loading.keys(), ...this.#failures.keys()])) {
      const [level,x,y]=key.split("/").map(Number) as [number,number,number];
      const scale=2**level, left=x*TILE_SIZE*scale, top=y*TILE_SIZE*scale;
      if(left>=rect.x+rect.width||top>=rect.y+rect.height||left+TILE_SIZE*scale<=rect.x||top+TILE_SIZE*scale<=rect.y) continue;
      this.#failures.delete(key);
      const pixels=this.#tiles.get(key);
      if(pixels) { this.#bytes-=bytesOf(pixels); this.#tiles.delete(key); }
      this.#versions.set(key,(this.#versions.get(key)??0)+1);
    }
    for(const listener of this.#listeners) listener(rect);
  }
  /** Observe invalidation, including changes emitted by the source. */
  subscribe(listener: (rect: Rect) => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  /** Release subscriptions and cached pixels. */
  dispose() { if(this.#disposed)return; this.#disposed=true; this.#lifetime.abort(new CacheDisposedError("Tile cache disposed")); this.#failures.clear(); if(this.allowance instanceof TileCacheBudget)this.allowance.delete(this); this.#stop?.(); this.#listeners.clear(); this.#tiles.clear(); this.#bytes=0; }

  get bytes() {
    return this.#bytes;
  }

  /** The tile if it is here, marked as recently used. */
  peek(tile: TileAddress): PixelBuffer | undefined {
    const key = tileKey(tile);
    const pixels = this.#tiles.get(key);
    if (pixels) {
      this.#tiles.delete(key);
      this.#tiles.set(key, pixels);
    }
    return pixels;
  }

  /** Start loading a tile unless it is here or on its way. */
  request(tile: TileAddress): void {
    if(this.#disposed)return;
    const key = tileKey(tile);
    if (this.#tiles.has(key) || this.#loading.has(key) || this.#failures.has(key)) return;
    // Capture the revision now, but start after insertion: a synchronous throw must not leave
    // an already-completed job in #loading.
    const version=this.#versions.get(key)??0;
    this.#loading.set(key, Promise.resolve().then(() => this.#load(key, tile, version)));
  }

  /** Wait for queued upstream edits and outstanding tile reads, including invalidation during a read. */
  async idle(signal?: AbortSignal): Promise<void> {
    const lifetime = AbortSignal.any([this.#lifetime.signal, ...(signal ? [signal] : [])]);
    for (let attempt=0;;attempt++) {
      if(attempt)await retryRead(attempt,lifetime);
      if(this.#disposed)throw new CacheDisposedError("Tile cache disposed");
      lifetime.throwIfAborted();
      await abortable(this.source.idle?.(lifetime), lifetime);
      if(this.#disposed)throw new CacheDisposedError("Tile cache disposed");
      if (this.#failures.size) throw this.#failures.values().next().value;
      if (!this.#loading.size) return;
      await abortable(Promise.all(this.#loading.values()), lifetime);
    }
  }

  async #load(key: string, tile: TileAddress, version: number) {
    if(this.#disposed) {this.#loading.delete(key);return;}
    try {
      const pixels = await abortable(this.source.readTile(tile, this.#lifetime.signal), this.#lifetime.signal);
      this.reads++;
      if(this.#disposed || version !== (this.#versions.get(key)??0)) return;
      this.#tiles.set(key, pixels);
      this.#bytes += bytesOf(pixels);
      this.trimToBudget();
    } catch (error) {
      if(!this.#disposed && version === (this.#versions.get(key)??0)) {
        this.#failures.set(key, error);
        this.onError?.(error, tile);
      }
    } finally {
      this.#loading.delete(key);
      this.onLoad?.();
    }
  }

  /** Evict oldest pixels to honour the current shared allowance. */
  trimToBudget() {
    for (const [key, pixels] of this.#tiles) {
      if (this.#bytes <= this.budget) return;
      this.#tiles.delete(key);
      this.#bytes -= bytesOf(pixels);
    }
  }
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/**
 * Copy a rectangle of a level out of the cache. The rectangle may run past the document: those
 * pixels repeat the nearest edge, so a filter sees no dark fringe. Returns null, and requests what
 * is missing, unless every tile it needs is here.
 */
export function assembleRegion(cache: TileCache, size: Size, level: number, rect: Rect): PixelBuffer | null {
  const full = levelSize(size, level);
  const inside = {
    x: clamp(rect.x, full.width - 1),
    y: clamp(rect.y, full.height - 1),
    width: 0,
    height: 0,
  };
  inside.width = clamp(rect.x + rect.width, full.width) - inside.x;
  inside.height = clamp(rect.y + rect.height, full.height) - inside.y;
  const tiles = tilesInRect(size, level, { ...inside, width: Math.max(1, inside.width), height: Math.max(1, inside.height) });

  const neededBytes = tiles.reduce((total, tile) => { const rect = tileRect(size, tile); return total + rect.width * rect.height * 16; }, 0);
  if (neededBytes > cache.budget) throw new RangeError("Tile region exceeds cache budget");
  const held = new Map<string, PixelBuffer>();
  let ready = true;
  for (const tile of tiles) {
    const pixels = cache.peek(tile);
    if (pixels) held.set(tileKey(tile), pixels);
    else {
      cache.request(tile);
      ready = false;
    }
  }
  if (!ready) return null;

  const out = createPixels(rect.width, rect.height);
  for (let row = 0; row < rect.height; row++) {
    const docY = clamp(rect.y + row, full.height - 1);
    const tileY = Math.floor(docY / TILE_SIZE);
    let column = 0;
    while (column < rect.width) {
      const docX = clamp(rect.x + column, full.width - 1);
      const tileX = Math.floor(docX / TILE_SIZE);
      const pixels = held.get(`${level}/${tileX}/${tileY}`)!;
      const inTileY = docY - tileY * TILE_SIZE;
      const inTileX = docX - tileX * TILE_SIZE;
      // Past the left or right edge, or a run of one: copy pixel by pixel. Otherwise copy the run.
      const past = rect.x + column < 0 || rect.x + column >= full.width;
      const run = past ? 1 : Math.min(rect.width - column, pixels.width - inTileX);
      const from = (inTileY * pixels.width + inTileX) * 4;
      out.data.set(pixels.data.subarray(from, from + run * 4), (row * rect.width + column) * 4);
      column += run;
    }
  }
  return out;
}
