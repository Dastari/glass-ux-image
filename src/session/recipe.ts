import { normaliseGeometry, type Geometry, type LayerSpec } from "../core/index.js";
/** A deterministic source-coordinate pointer sample. Additional tool data belongs in params. */
export interface StrokePoint { x: number; y: number; pressure?: number; time?: number }
/** Plain stroke data; kernels belong to an opt-in source stage. */
export interface Stroke {
  id: string; tool: string; params: unknown; points: readonly StrokePoint[];
  /** Target layer id, with points in that layer's pixels. Absent targets the base picture. */
  layer?: string;
  /** Paint the target layer's mask rather than its pixels. Needs `layer`. */
  mask?: boolean;
}
/** A serialisable edit. Missing Stage 3 fields on old recipes receive empty defaults. */
export interface EditRecipe {
  geometry: Geometry;
  filters: Readonly<Record<string, unknown>>;
  layers?: readonly LayerSpec[];
  strokes?: readonly Stroke[];
}
export type NormalisedRecipe = EditRecipe & { geometry: Required<Geometry>; layers: readonly LayerSpec[]; strokes: readonly Stroke[] };
const NO_LAYERS: readonly LayerSpec[] = [];
const NO_STROKES: readonly Stroke[] = [];
/** Upgrade a Stage 2 recipe without traversing stroke or layer payloads. */
export function normaliseRecipe(recipe: Partial<EditRecipe> = {}): NormalisedRecipe {
  return { ...recipe, geometry: normaliseGeometry(recipe.geometry), filters: recipe.filters ?? {}, layers: recipe.layers ?? NO_LAYERS, strokes: recipe.strokes ?? NO_STROKES };
}
/** Normalised geometry and empty filters, layers and strokes for a fresh session. */
export const EMPTY_RECIPE: NormalisedRecipe = normaliseRecipe();
/** Reference-first structural comparison: shared stroke lists and payloads are never traversed. */
export function recipesEqual(a: unknown, b: unknown): boolean {
  if(a===b) return true;
  if(!a||!b||typeof a!=="object"||typeof b!=="object") return false;
  const ak=Object.keys(a),bk=Object.keys(b);
  return ak.length===bk.length && ak.every(key=>Object.hasOwn(b,key)&&recipesEqual((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
