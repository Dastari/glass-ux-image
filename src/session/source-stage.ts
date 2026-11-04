import type { LayerSpec, TileSource } from "../core/index.js";
import type { EditRecipe } from "./recipe.js";
import type { EditorSession } from "./session.js";
/** Where a stage's layer application lands, and whether it may change the live source. */
export interface StageContext {
  /** Reconcile a separate read branch; never change the live source. */
  isolated?: boolean;
}
/** A layer application: the layer's pixels, or its mask's coverage when `mask` is true. */
export interface LayerStageContext extends StageContext {
  /** The source is the layer's mask, in the layer's pixels, and only its alpha counts. */
  mask?: boolean;
}
/**
 * An opt-in source operation before geometry. A stage owns its reconciliation cache: reuse the
 * returned source when possible and emit its invalidated rectangles when a stroke list changes.
 * The same base can be passed repeatedly, including undo/redo and exports; replay must be deterministic.
 * An isolated application must return an independent read branch without mutating the live source.
 */
export interface SourceStage {
  id: string;
  /** Release session-owned stores when history is discarded or the session is disposed. */
  release?: (session: EditorSession) => void;
  apply(base: TileSource, recipe: EditRecipe, session: EditorSession, context?: StageContext): TileSource;
  /**
   * Optional: the same work on one layer's pixels, before the layer is positioned, or on its mask.
   * Strokes for it carry `layer: layer.id`, and `mask: true` for the mask. Stages without this
   * leave layers alone.
   */
  applyLayer?(pixels: TileSource, layer: LayerSpec, recipe: EditRecipe, session: EditorSession, context?: LayerStageContext): TileSource;
}
