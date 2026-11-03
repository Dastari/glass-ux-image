import { type ReactNode } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import { HistogramPanel } from "glass-ux-image/panels/histogram";
import { BasicPanel, basicDevelop } from "glass-ux-image/tools/develop/basic";

const photo = `${import.meta.env.BASE_URL}sample.png`;

/** The sample photo in a contained stage, with a panel beside it as in an editor window. */
function Stage({ editor, canvas, children }: {
  editor: EditorSession;
  canvas?: ReactNode;
  children?: ReactNode;
}) {
  const { status } = useSessionState(editor);
  const ready = status === "ready";
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

function HistogramPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [basicDevelop] });
  return (
    <Stage editor={editor}>
      <div className="flex flex-col gap-4">
        <HistogramPanel />
        <BasicPanel />
      </div>
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Tones of the edited picture"
        description="Counts every tone of the current preview, including a slider that is still being dragged. Move Brightness to see the dusk sky shift."
      >
        <div data-live-demo="histogram-panel" className="w-full">
          <HistogramPanelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
