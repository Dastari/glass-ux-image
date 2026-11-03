import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createEditorSession, type EditorSession, type EditorSessionOptions, type SessionState } from "../session/index.js";

const SessionContext = /* @__PURE__ */ createContext<EditorSession | null>(null);

/** Provide an existing host-owned session to descendant editor parts; does not create or dispose it. */
export function ImageEditorProvider({ editor, children }: {
  /** Existing session whose lifetime belongs to the host. */
  editor: EditorSession;
  /** Parts reading the provided session. */
  children?: ReactNode;
}) {
  return <SessionContext.Provider value={editor}>{children}</SessionContext.Provider>;
}

/** The nearest editor. Throws outside `ImageEditorProvider`, so a missing provider is obvious. */
export function useEditorContext(): EditorSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Wrap this component in ImageEditorProvider");
  return session;
}

/**
 * Start an editor for a picture. Callbacks can change on any render; a new `source` starts a new
 * session. The session ends with the component.
 */
export function useImageEditor(options: EditorSessionOptions): EditorSession {
  const latest = useRef(options);
  latest.current = options;

  const create = useCallback(
    (source: EditorSessionOptions["source"]) =>
      createEditorSession({
        ...latest.current,
        source,
        onAction: (action, next) => (latest.current.onAction ? latest.current.onAction(action, next) : next()),
        onSave: latest.current.onSave && ((result, context) => latest.current.onSave?.(result, context)),
        onExport: latest.current.onExport && ((blob, context) => latest.current.onExport?.(blob, context)),
        onCancel: latest.current.onCancel && (() => latest.current.onCancel?.()),
        onChange: (recipe) => latest.current.onChange?.(recipe),
        onDirtyChange: (dirty) => latest.current.onDirtyChange?.(dirty),
        onError: (error) => latest.current.onError?.(error),
      }),
    [],
  );

  const [current, setCurrent] = useState(() => ({ source: options.source, session: create(options.source) }));
  if (current.source !== options.source) {
    const next = { source: options.source, session: create(options.source) };
    current.session.dispose();
    setCurrent(next);
    return next.session;
  }

  // Strict mode unmounts and remounts at once, so disposal waits a tick for the remount to cancel it.
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(pending.current);
    const { session } = current;
    return () => {
      pending.current = setTimeout(() => session.dispose());
    };
  }, [current]);
  return current.session;
}

/** The session passed in, or the nearest one. */
function useResolved(session: EditorSession | undefined) {
  const nearest = useContext(SessionContext);
  if (session ?? nearest) return (session ?? nearest)!;
  throw new Error("Pass an editor, or wrap this component in ImageEditorProvider");
}

/** The session's state, re-rendering when it changes. */
export function useSessionState(session?: EditorSession): SessionState {
  const resolved = useResolved(session);
  return useSyncExternalStore(resolved.subscribe, resolved.getState, resolved.getState);
}

/** Run an action, and know whether it can run now. */
export function useAction(id: string, session?: EditorSession) {
  const resolved = useResolved(session);
  useSessionState(resolved);
  return { ...resolved.action(id), run: (args?: unknown) => resolved.run(id, args) };
}

/** The session passed in, or the nearest one, for parts that work in either place. */
export { useResolved as useEditor };

/** Subscribe to branching history and expose intercepted undo, redo and goTo commands. */
export function useImageHistory(session?: EditorSession) {
  const resolved = useResolved(session);
  const { canUndo, canRedo, dirty } = useSessionState(resolved);
  return { ...resolved.history, goTo: (id: string) => resolved.run("edit.goTo", id), canUndo, canRedo, dirty, undo: () => resolved.run("edit.undo"), redo: () => resolved.run("edit.redo") };
}

/** Read and select the active tool through the session action boundary. */
export function useTool(session?: EditorSession) {
  const resolved = useResolved(session);
  const { tool } = useSessionState(resolved);
  return { tool, select: (id: string | null) => resolved.run("tool.select", id) };
}

/** Which backend is drawing, for a status line or a support report. */
export function useRenderer(session?: EditorSession) {
  const resolved = useResolved(session);
  useSessionState(resolved);
  return resolved.renderer?.backend.info ?? null;
}


/** Plain-data layers and intercepted editing operations, bottom first. Selection is shared by
 * layer panels and geometry tools; it is view state and creates no history entry. */
export function useLayers(session?: EditorSession) {
  const resolved = useResolved(session), { draft, toolData } = useSessionState(resolved);
  const layers = draft.layers ?? [];
  const requested = toolData["layers.selectedId"] as string | null | undefined;
  const selectedId = requested && layers.some(layer => layer.id === requested) ? requested : null;
  const set = (next: readonly import("../core/index.js").LayerSpec[], label?: string) =>
    label ? resolved.commit({ layers: next }, { label }) : resolved.run("layers.set", next);
  return {
    layers,
    selectedId,
    selectedLayer: layers.find(layer => layer.id === selectedId) ?? null,
    select: (id: string | null) => resolved.setToolData("layers.selectedId", id),
    set,
    add: (layer: import("../core/index.js").LayerSpec, label?: string) => label ? set([...layers, layer], label) : resolved.run("layers.add", layer),
    update: (id: string, patch: Partial<import("../core/index.js").LayerSpec>, label?: string) => label ? set(layers.map(layer => layer.id === id ? { ...layer, ...patch } : layer), label) : resolved.run("layers.update", { id, patch }),
    remove: (id: string, label?: string) => label ? set(layers.filter(layer => layer.id !== id), label) : resolved.run("layers.remove", id),
    reorder: (ids: readonly string[], label?: string) => label ? set(ids.map(id => layers.find(layer => layer.id === id)!).filter(Boolean), label) : resolved.run("layers.reorder", ids),
  };
}
