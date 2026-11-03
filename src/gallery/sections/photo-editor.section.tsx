import { type ReactNode, useEffect } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import {
  PhotoEditor,
  PhotoEditorActions,
  PhotoEditorStatus,
  PhotoEditorView,
} from "glass-ux-image/photo-editor";
import { crop } from "glass-ux-image/tools/crop";
import { develop } from "glass-ux-image/tools/develop";
import { effects } from "glass-ux-image/tools/effects";
import { brush } from "glass-ux-image/tools/retouch/brush";
import { text } from "glass-ux-image/tools/text";

const photo = `${import.meta.env.BASE_URL}sample.png`;

const tools = [crop, develop, brush, text, effects];

/** The sample photo in a contained stage, with a panel beside it as in an editor window. */
function Stage({ editor, canvas, bar, onReady, children }: {
  editor: EditorSession;
  canvas?: ReactNode;
  bar?: ReactNode;
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
        {bar && (
          <div className="flex min-h-12 items-center gap-2 border-b border-line px-3 py-2">
            {ready && bar}
          </div>
        )}
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

// Three labelled develop edits, as a person might make them.
function addEdits(editor: EditorSession) {
  const steps = [
    ["Exposure", { exposure: 0.3 }],
    ["Shadows", { exposure: 0.3, shadows: 45 }],
    ["Temperature", { exposure: 0.3, shadows: 45, temperature: 15 }],
  ] as const;
  for (const [label, develop] of steps)
    editor.run("edit.commit", { change: { filters: { develop } }, options: { label } });
}

function PhotoEditorSample() {
  return (
    <div className="h-160 w-full min-w-0 overflow-hidden rounded-surface border border-line">
      <PhotoEditor src={photo} tools={tools} />
    </div>
  );
}

function PhotoEditorViewSample() {
  const editor = useImageEditor({ source: photo, tools: tools });
  return (
    <div className="h-160 w-full min-w-0 overflow-hidden rounded-surface border border-line">
      <PhotoEditorView editor={editor} tools={tools} />
    </div>
  );
}

function PhotoEditorActionsSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return <Stage editor={editor} bar={<PhotoEditorActions />} onReady={addEdits} />;
}

function PhotoEditorStatusSample() {
  const editor = useImageEditor({ source: photo, tools: [...tools] });
  return <Stage editor={editor} bar={<PhotoEditorStatus />} />;
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="A photo editor in a window"
        description="Tools, canvas, settings and history for one picture. It fills its parent, so a dialog, a window or a page section sets its size."
      >
        <div data-live-demo="photo-editor" className="w-full">
          <PhotoEditorSample />
        </div>
      </Specimen>
      <Specimen
        title="Over a session the host holds"
        description="PhotoEditorView shows a session the host created, for when something outside the editor needs it too, such as a save button in the title bar."
      >
        <div data-live-demo="photo-editor-view" className="w-full">
          <PhotoEditorViewSample />
        </div>
      </Specimen>
      <Specimen
        title="Undo and redo"
        description="For a window's title bar or action slot. This photo has three edits to step through."
      >
        <div data-live-demo="photo-editor-actions" className="w-full">
          <PhotoEditorActionsSample />
        </div>
      </Specimen>
      <Specimen
        title="Size and zoom"
        description="For a window's status bar. It follows the canvas as it zooms."
      >
        <div data-live-demo="photo-editor-status" className="w-full">
          <PhotoEditorStatusSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
