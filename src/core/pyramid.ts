import { TILE_SIZE } from "./pixels.js";

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** A tile's place in the pyramid. Level 0 is full resolution; each level halves both sides. */
export interface TileAddress {
  level: number;
  x: number;
  y: number;
}

/** Stable cache key for a pyramid level and tile coordinates. */
export const tileKey = ({ level, x, y }: TileAddress) => `${level}/${x}/${y}`;

/** A document's size at a pyramid level, rounding up so no edge pixel is lost. */
export function levelSize(size: Size, level: number): Size {
  const scale = 2 ** level;
  return { width: Math.ceil(size.width / scale), height: Math.ceil(size.height / scale) };
}

/** The first level at which the whole document fits one tile. */
export function coarsestLevel(size: Size): number {
  return Math.max(0, Math.ceil(Math.log2(Math.max(size.width, size.height) / TILE_SIZE)));
}

/** A tile's pixels at its own level. Tiles on the right and bottom edges are cut to the document. */
export function tileRect(size: Size, { level, x, y }: TileAddress): Rect {
  const full = levelSize(size, level);
  const left = x * TILE_SIZE;
  const top = y * TILE_SIZE;
  return { x: left, y: top, width: Math.min(TILE_SIZE, full.width - left), height: Math.min(TILE_SIZE, full.height - top) };
}

/** Every tile at `level` touching `rect`, which is in that level's pixels. */
export function tilesInRect(size: Size, level: number, rect: Rect): TileAddress[] {
  const full = levelSize(size, level);
  const left = Math.max(0, Math.floor(rect.x / TILE_SIZE));
  const top = Math.max(0, Math.floor(rect.y / TILE_SIZE));
  const right = Math.min(Math.ceil(full.width / TILE_SIZE), Math.ceil((rect.x + rect.width) / TILE_SIZE));
  const bottom = Math.min(Math.ceil(full.height / TILE_SIZE), Math.ceil((rect.y + rect.height) / TILE_SIZE));
  const tiles: TileAddress[] = [];
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) tiles.push({ level, x, y });
  return tiles;
}
