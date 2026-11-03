import { type ReactNode, useEffect, useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import { rectQuad, type LayerSpec } from "glass-ux-image/core";
import { LayersPanel, SessionLayersPanel } from "glass-ux-image/panels/layers";
import { layers as layersTool } from "glass-ux-image/tools/layers";
import { addTextLayer, defaultTextSpec, text } from "glass-ux-image/tools/text";

const photo = `${import.meta.env.BASE_URL}sample.png`;

/** The sample photo in a contained stage, with a panel beside it as in an editor window. */
function Stage({ editor, canvas, onReady, children }: {
  editor: EditorSession;
  canvas?: ReactNode;
  onReady?: (editor: EditorSession) => unknown;
  children?: ReactNode;
}) {
  const { status } = useSessionState(editor);
  const ready = status === "ready";
  useEffect(() => {
    // Seed once, when the photo opens: a fresh session has nothing to undo.
    if (ready && onReady && !editor.state.canUndo) void onReady(editor);
  }, [editor, ready, onReady]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 w-full min-w-0 flex-col overflow-hidden rounded-surface border border-line">
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            {ready && canvas ? canvas : <ImageCanvas aria-label="Sample photo" className="absolute inset-0" />}
          </div>
          {children && (
            <div className="w-80 shrink-0 overflow-y-auto border-s border-line p-4">
              {ready ? children : <p role="status" className="type-caption text-fg-muted">Opening sample…</p>}
            </div>
          )}
        </div>
      </div>
    </ImageEditorProvider>
  );
}

// A white caption over the sky, selected so the panels act on it.
async function addCaption(editor: EditorSession) {
  const spec = { ...defaultTextSpec, content: "Lake at dusk", fontSize: 96, lineHeight: 112 };
  const id = await addTextLayer(editor, spec, [110, 200], "Caption", "Add caption");
  if (id) editor.setToolData("layers.selectedId", id);
}

const layer = (id: string, name: string, kind: string, patch: Partial<LayerSpec> = {}): LayerSpec => ({
  id,
  name,
  kind,
  visible: true,
  opacity: 1,
  blend: "normal",
  quad: rectQuad({ width: 1500, height: 1000 }),
  ...patch,
});

function LayersPanelSample() {
  const [layers, setLayers] = useState<readonly LayerSpec[]>([
    layer("caption", "Caption", "text"),
    layer("glow", "Sunset glow", "image", { blend: "screen", opacity: 0.6 }),
    layer("logo", "Logo", "image", { visible: false }),
  ]);
  return (
    <div className="w-full max-w-sm">
      <LayersPanel layers={layers} onLayersChange={setLayers} defaultSelectedId="caption" />
    </div>
  );
}

function SessionLayersPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [layersTool, text] });
  return (
    <Stage editor={editor} onReady={addCaption}>
      <SessionLayersPanel />
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="A plain list of layers"
        description="Reorder by dragging or with Alt and the arrow keys, rename with F2, and use each row's menu. The host owns the list, so it can store layers anywhere."
      >
        <div data-live-demo="layers-panel" className="w-full">
          <LayersPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Layers of the open picture"
        description="Adds images, pastes and flattens through session actions, so each change is undoable. The caption here is a text layer."
      >
        <div data-live-demo="session-layers-panel" className="w-full">
          <SessionLayersPanelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
