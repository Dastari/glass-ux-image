import type { TileSource } from "../core/index.js";
import type { EditRecipe } from "./recipe.js";
import type { EditorSession } from "./session.js";
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
  apply(base: TileSource, recipe: EditRecipe, session: EditorSession, context?: { /** Reconcile a separate read branch; never change the live source. */ isolated?: boolean }): TileSource;
}
