import { Notice } from 'glass-ux/notice';
import { useEffect, useState } from "react";
import { Button } from "glass-ux/button";
import { IconText } from "glass-ux/icons";
import { useMessages } from "glass-ux/i18n";
import { useCanvasMapping } from "../../canvas/image-canvas.js";
import { geometryMapping, homography, rectQuad, type LayerSpec, type Point, type Quad } from "../../core/index.js";
import { createTextSource, textLayerKind, whenFontReady, type TextSpec } from "../../layers-text/index.js";
import { layersMessages } from "../../messages/layers.js";
import { useEditor, useLayers, useSessionState } from "../../react/session-context.js";
import { defineTool } from "../../react/tool.js";
import type { EditorSession } from "../../session/index.js";
import { textQuad, remeasureTextQuad, textEditorTransform } from "./math.js";
import { TextPanel } from "./panel.js";
import { TextEditor } from "./editor.js";
import { createId } from '../../core/id.js';
export { TextPanel, type TextPanelProps } from "./panel.js";
export { TextEditor, type TextEditorProps } from "./editor.js";
export { textQuad, remeasureTextQuad } from "./math.js";
export * from "../../layers-text/index.js";

/** Default text data; hosts can replace it before placement. */
export const defaultTextSpec: TextSpec = { content: "", fontFamily: "sans-serif", fontSize: 48, fontWeight: 400,
  fontStyle: "normal", colour: [1, 1, 1, 1], alignment: "start", direction: "ltr", lineHeight: 58, letterSpacing: 0, boxWidth: null };

/** Add text at a work-space baseline anchor. Waits for fonts with a bounded fallback. */
export async function addTextLayer(session: EditorSession, spec: TextSpec, anchor: Point, name: string, label: string): Promise<string | null> {
  await whenFontReady(spec);
  const source = createTextSource(spec), id = createId();
  const layer: LayerSpec = { id, name, kind: "text", data: spec, quad: textQuad(source.bounds, anchor), visible: true, opacity: 1, blend: "normal" };
  session.commit({ layers: [...(session.state.recipe.layers ?? []), layer] }, { label });
  return session.state.recipe.layers?.some(layer => layer.id === id) ? id : null;
}

/** Update text and remeasure its quad while preserving its existing projective transform. */
export function editedTextLayer(layer: LayerSpec, spec: TextSpec): LayerSpec {
  const oldBounds = createTextSource(layer.data as TextSpec).bounds, nextBounds = createTextSource(spec).bounds;
  return { ...layer, data: spec, quad: remeasureTextQuad(layer, oldBounds, nextBounds) };
}
/** Props shared by the session-bound text parts. */
export interface SessionTextProps {
  /** Explicit session, or the nearest editor provider. */
  session?: EditorSession;
}
/** Styling for the selected text, or defaults for the next text layer. */
export function SessionTextPanel({ session }: SessionTextProps) {
  const editor = useEditor(session), state = useSessionState(editor), layers = useLayers(editor), m = useMessages(layersMessages);
  const [error, setError] = useState(false);
  const layer = layers.selectedLayer?.kind === "text" ? layers.selectedLayer : null;
  const spec = layer ? layer.data as TextSpec : (state.toolData["text.defaults"] as TextSpec | undefined) ?? defaultTextSpec;
  return <>
    <TextPanel value={spec} onValueChange={(next, label) => {
      if (!layer) { editor.setToolData("text.defaults", next); return; }
      void whenFontReady(next).then(() => {
        // Font loading may yield: resolve the current recipe instead of replacing concurrent edits.
        const current = editor.state.recipe.layers?.find(item => item.id === layer.id);
        if (!current) return;
        try { const changed = editedTextLayer(current, next); editor.commit({ layers: editor.state.recipe.layers!.map(item => item.id === current.id ? changed : item) }, { label }); setError(false); }
        catch { setError(true); }
      });
    }} />
    <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: error ? undefined : "hidden"}}>{m.failed}</Notice></div>
  </>;
}
/** Click an existing glyph layer to edit it, or the stage to place a new one. */
export function SessionTextOverlay({ session }: SessionTextProps) {
  const editor = useEditor(session), state = useSessionState(editor), layers = useLayers(editor), mapping = useCanvasMapping(), m = useMessages(layersMessages);
  // The Select tool asks for an edit by naming the layer in tool data when a double-click brings it here.
  const [editing, setEditing] = useState<string | null>(() => (editor.state.toolData["text.edit"] as string | undefined) ?? null), [error, setError] = useState(false);
  useEffect(() => { editor.setToolData("text.historyLabel", m.editText); }, [editor, m.editText]);
  useEffect(() => { if (editor.state.toolData["text.edit"] !== undefined) editor.setToolData("text.edit", undefined); }, [editor]);
  if (!state.sourceSize || !state.size) return null;
  const geometry = geometryMapping(state.sourceSize, state.draft.geometry);
  const layer = layers.layers.find(layer => layer.id === editing && layer.kind === "text");
  const place = async (point: Point) => {
    try {
      const defaults = (editor.state.toolData["text.defaults"] as TextSpec | undefined) ?? defaultTextSpec;
      const id = await addTextLayer(editor, { ...defaults, content: m.newText }, point, m.newText, m.placeText);
      if (id) { layers.select(id); setEditing(id); }
    } catch { setError(true); }
  };
  const at = (point: Point) => {
    for (const layer of [...layers.layers].reverse()) {
      if (!layer.visible || layer.kind !== "text") continue;
      const p = homography(layer.quad, rectQuad({ width: 1, height: 1 }))(...point);
      if (p && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1) { layers.select(layer.id); setEditing(layer.id); return; }
    }
    void place(point);
  };
  const finish = () => { setEditing(null); };
  let transform: string | null = null;
  if (layer) {
    const points = layer.quad.map(point => geometry.fromWork(...point)).map(point => {
      if (!point) return null;
      const screen = mapping.toScreen({ x: point[0], y: point[1], width: 0, height: 0 });
      return [screen.x, screen.y] as Point;
    });
    if (points.every(point => point !== null)) {
      const source = createTextSource(layer.data as TextSpec);
      transform = textEditorTransform(points as unknown as Quad, source.width, source.height);
    }
  }
  return <div className="gi-text-overlay" data-canvas-tool="" onPointerDown={event => {
    if ((event.target as Element).closest("button,textarea,input")) return;
    event.preventDefault(); event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect(), p = mapping.toDocument(event.clientX - box.x, event.clientY - box.y);
    const work = geometry.toWork(p.x, p.y); if (work) at(work);
  }}>
    <div className="gi-text-place"><Button size="sm" variant="secondary" onClick={() => { const work = geometry.toWork(state.size!.width / 2, state.size!.height / 2); if (work) void place(work); }}>{m.placeText}</Button>
      {layers.selectedLayer?.kind === "text" && <Button size="sm" onClick={() => setEditing(layers.selectedLayer!.id)}>{m.editText}</Button>}
    </div>
    {layer && transform && <TextEditor key={layer.id} value={layer.data as TextSpec}
      /* logical:allow picture coordinates do not mirror */
      style={{ position: "absolute", left: 0, top: 0, transform, transformOrigin: "top left" }}
      onPreview={spec => {
        const next = editedTextLayer(layer, spec);
        editor.preview({ layers: editor.state.draft.layers!.map(item => item.id === layer.id ? next : item) });
      }}
      onCommit={spec => {
        const next = editedTextLayer(layer, spec);
        editor.commit({ layers: editor.state.draft.layers!.map(item => item.id === layer.id ? next : item) }, { label: m.editText }); finish();
      }} onCancel={() => { editor.revert(); finish(); }} />}
    <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: error ? undefined : "hidden"}}>{m.failed}</Notice></div>
  </div>;
}
/** Opt-in text tool. Image-only layers and crop hosts never import this entry. */
export const text = defineTool({ id: "text", group: "layers", messages: layersMessages,
  label: m => m.text, icon: <IconText />, shortcut: "t", layerKinds: [textLayerKind], Panel: SessionTextPanel, Overlay: SessionTextOverlay,
  reset: recipe => ({ layers: recipe.layers.filter(layer => layer.kind !== "text") }),
  leave(session) {
    if (session.state.draft.layers !== session.state.recipe.layers) {
      session.run("edit.commit", { change: { layers: session.state.draft.layers }, options: { label: session.state.toolData["text.historyLabel"] as string } });
    }
  },
});
