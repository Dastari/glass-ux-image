import { type ReactNode, useEffect, useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import {
  SessionTextOverlay,
  SessionTextPanel,
  TextEditor,
  TextPanel,
  addTextLayer,
  defaultTextSpec,
  text,
} from "glass-ux-image/tools/text";

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

function SessionTextOverlaySample() {
  const editor = useImageEditor({ source: photo, tools: [text] });
  return <Stage editor={editor} canvas={
        <ImageCanvas aria-label="Text on the sample photo" className="absolute inset-0">
          <SessionTextOverlay />
        </ImageCanvas>
      } onReady={addCaption} />;
}

function SessionTextPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [text] });
  return (
    <Stage editor={editor} onReady={addCaption}>
      <SessionTextPanel />
    </Stage>
  );
}

function TextEditorSample() {
  const [value, setValue] = useState({
    ...defaultTextSpec,
    content: "Lake at dusk",
    fontSize: 32,
    lineHeight: 40,
  });
  const [status, setStatus] = useState("Editing");
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="relative overflow-hidden rounded-surface border border-line">
        <img src={photo} alt="A mountain lake at dusk, with snow on the far ridge and pines in the foreground" draggable={false} className="block aspect-3/2 w-full select-none" />
        <div className="absolute start-4 top-4">
          <TextEditor
            key={value.content}
            value={value}
            onCommit={(next) => {
              setValue(next);
              setStatus(`Committed: ${next.content}`);
            }}
            onCancel={() => setStatus("Cancelled")}
          />
        </div>
      </div>
      <output aria-live="polite" className="type-caption text-fg-muted">{status}</output>
    </div>
  );
}

function TextPanelSample() {
  const [value, setValue] = useState({ ...defaultTextSpec, content: "Lake at dusk" });
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <TextPanel
        value={value}
        onValueChange={(next, label) => {
          setValue(next);
          setLast(label);
        }}
      />
      <output aria-live="polite" className="type-caption text-fg-muted">
        {value.fontFamily}, {value.fontSize} px{last ? `. Last change: ${last}` : ""}
      </output>
    </div>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Text on the photo"
        description="Click the caption to edit it, or anywhere else on the photo to place new text. Each placement and edit is one undoable step."
      >
        <div data-live-demo="session-text-overlay" className="w-full">
          <SessionTextOverlaySample />
        </div>
      </Specimen>
      <Specimen
        title="Style the selected text"
        description="Font, size, colour and alignment for the selected text layer, or the defaults for the next one when none is selected."
      >
        <div data-live-demo="session-text-panel" className="w-full">
          <SessionTextPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Edit in place"
        description="A text box that keeps the browser's own input methods, so composed languages work. Enter adds a line, Ctrl or Command and Enter finishes, and Escape cancels."
      >
        <div data-live-demo="text-editor" className="w-full">
          <TextEditorSample />
        </div>
      </Specimen>
      <Specimen
        title="Text settings on their own"
        description="The same controls with plain values and no session. Sizes are in document pixels; a wrap width of zero means no automatic wrapping."
      >
        <div data-live-demo="text-panel" className="w-full">
          <TextPanelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
