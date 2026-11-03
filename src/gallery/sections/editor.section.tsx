import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import {
  BeforeAfter,
  ImageEditor,
  ImageEditorView,
  ToolLabel,
  ToolRail,
  ToolSettings,
} from "glass-ux-image/editor";
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

function ImageEditorSample() {
  return (
    <div className="h-160 w-full min-w-0 overflow-hidden rounded-surface border border-line">
      <ImageEditor src={photo} tools={tools} />
    </div>
  );
}

function ImageEditorViewSample() {
  const editor = useImageEditor({ source: photo, tools: tools });
  return (
    <div className="h-160 w-full min-w-0 overflow-hidden rounded-surface border border-line">
      <ImageEditorView editor={editor} tools={tools} />
    </div>
  );
}

function BeforeAfterSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return <Stage editor={editor} canvas={<BeforeAfter maxEdge={1200} />} onReady={addEdits} />;
}

function ToolRailSample() {
  const editor = useImageEditor({ source: photo, tools: [...tools] });
  return <Stage editor={editor} bar={<ToolRail tools={tools} />} />;
}

function ToolSettingsSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage editor={editor}>
      <ToolSettings tool={develop} />
    </Stage>
  );
}

function ToolLabelSample() {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const onLabel = useCallback(
    (id: string, label: string) => setLabels((current) => ({ ...current, [id]: label })),
    [],
  );
  return (
    <div className="flex flex-col gap-2">
      {tools.map((tool) => (
        <ToolLabel key={tool.id} tool={tool} onLabel={onLabel} />
      ))}
      <output aria-live="polite" className="type-caption text-fg-muted">
        {tools.map((tool) => `${tool.id}: ${labels[tool.id] ?? "…"}`).join(", ")}
      </output>
    </div>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="A workspace for one picture"
        description="ImageEditor opens a source and owns its session: tool rail, canvas, settings and history. Use it when the host has one picture and no need to reach the session."
      >
        <div data-live-demo="image-editor" className="w-full">
          <ImageEditorSample />
        </div>
      </Specimen>
      <Specimen
        title="Over a session the host holds"
        description="ImageEditorView shows a session the host created, so a filmstrip, a save button or a second view can share it."
      >
        <div data-live-demo="image-editor-view" className="w-full">
          <ImageEditorViewSample />
        </div>
      </Specimen>
      <Specimen
        title="Before and after"
        description="The photo as it opened against its current edits. It reads previews only, so it never changes the recipe or the history."
      >
        <div data-live-demo="before-after" className="w-full">
          <BeforeAfterSample />
        </div>
      </Specimen>
      <Specimen
        title="Tool rail"
        description="One single-choice toolbar for the session's tools. Large kits group into flyouts by family."
      >
        <div data-live-demo="tool-rail" className="w-full">
          <ToolRailSample />
        </div>
      </Specimen>
      <Specimen
        title="Tool settings"
        description="A tool's panel, or its collapsible sections, outside either editor. Use it to put a tool's controls in the host's own layout."
      >
        <div data-live-demo="tool-settings" className="w-full">
          <ToolSettingsSample />
        </div>
      </Specimen>
      <Specimen
        title="Tool names"
        description="Reports each tool's name in the current language, for hosts that build their own menus or action labels."
      >
        <div data-live-demo="tool-label" className="w-full">
          <ToolLabelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
