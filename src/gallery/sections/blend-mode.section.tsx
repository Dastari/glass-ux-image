import { type ReactNode, useEffect, useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import type { BlendMode } from "glass-ux-image/core";
import { BlendModeSelect, SessionBlendModeSelect } from "glass-ux-image/controls/blend-mode";
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

function BlendModeSelectSample() {
  const [mode, setMode] = useState<BlendMode>("multiply");
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <BlendModeSelect value={mode} onValueChange={setMode} />
      <output aria-live="polite" className="type-caption text-fg-muted">
        Blend mode: {mode}
      </output>
    </div>
  );
}

function SessionBlendModeSelectSample() {
  const editor = useImageEditor({ source: photo, tools: [text] });
  return (
    <Stage editor={editor} onReady={addCaption}>
      <SessionBlendModeSelect />
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Choose a blend mode"
        description="All sixteen modes, blended in linear light. The value is the mode's id, ready to store in a layer."
      >
        <div data-live-demo="blend-mode-select" className="w-full">
          <BlendModeSelectSample />
        </div>
      </Specimen>
      <Specimen
        title="For the selected layer"
        description="Changes the selected layer through a labelled action that onAction can refuse. Try Overlay or Soft light on the caption."
      >
        <div data-live-demo="session-blend-mode-select" className="w-full">
          <SessionBlendModeSelectSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
