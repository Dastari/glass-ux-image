import type { MessageDescriptor, MessageSet } from "glass-ux/i18n";
import type { ComponentType, ReactNode } from "react";
import type { Rect } from "../core/index.js";
import { normaliseRecipe, recipesEqual, type EditorSession, type EditRecipe, type NormalisedRecipe, type SessionTool } from "../session/index.js";
import type { ImageEditorMessages } from "./messages.js";

/** A tool: what it does to the session, and what it draws. */
export interface ImageTool<M extends MessageSet = any> extends SessionTool {
  /** Domain words for labels and section headings; defaults to the base editor messages. */
  messages?: MessageDescriptor<string, M>;
  /** Workspace grouping; tools without a group retain their host's ordering. */
  group?: "geometry" | "develop" | "retouch" | "effects" | "layers" | "files";
  /** Collapsible panels, used when Panel is absent. Labels should read the domain's messages. */
  Sections?: readonly { id: string; label: (messages: M) => string; Panel: ComponentType }[];
  /** Resolve the visible tool name from its domain message pack. */
  label: (messages: M) => string;
  /** Decorative tool glyph; the resolved label supplies its accessible name. */
  icon: ReactNode;
  /** A key that selects it while the editor has focus. */
  shortcut?: string;
  /** Controls for the side panel. */
  Panel?: ComponentType;
  /** Drawn over the canvas while the tool is active. */
  Overlay?: ComponentType;
  /** Give the tool its own button in a tool rail rather than folding it into its group's flyout. */
  standalone?: boolean;
  /**
   * The change that removes this tool's edits, for a Reset button. It receives the committed recipe;
   * when the change leaves the recipe as it is, there is nothing to reset. Without it, a tool with
   * `filters` resets those filters.
   */
  reset?: (recipe: NormalisedRecipe, session: EditorSession) => Partial<EditRecipe>;
}

/** Declare a tree-shakeable tool, inferring domain labels from its message descriptor. */
export const defineTool = <M extends MessageSet = ImageEditorMessages>(tool: ImageTool<M>): ImageTool<M> => tool;

/** Maps between the picture and the canvas, in CSS pixels. */
export interface CanvasMapping {
  /** Stage pixels per picture pixel. */
  scale: number;
  /** Project a document rectangle into canvas CSS pixels. */
  toScreen(rect: Rect): Rect;
  /** CSS stage coordinates to document pixels, including the live pan/zoom gesture. */
  toDocument(x: number, y: number): {x: number; y: number};
}

/** Filters without the given ids, for a tool's `reset`. */
export function withoutFilters(recipe: EditRecipe, ids: readonly string[]): Partial<EditRecipe> {
  return { filters: Object.fromEntries(Object.entries(recipe.filters).filter(([id]) => !ids.includes(id))) };
}

/** The change a Reset button would commit for this tool, or null when it has nothing to reset. */
export function toolResetChange(session: EditorSession, tool: ImageTool): Partial<EditRecipe> | null {
  // A tool that brings its own filters resets them unless it says otherwise.
  const reset = tool.reset ?? (tool.filters?.length ? (recipe: EditRecipe) => withoutFilters(recipe, tool.filters!.map(filter => filter.id)) : undefined);
  if (!reset || session.state.status !== "ready") return null;
  const recipe = normaliseRecipe(session.state.recipe), change = reset(recipe, session);
  return recipesEqual(normaliseRecipe({ ...recipe, ...change }), recipe) ? null : change;
}
