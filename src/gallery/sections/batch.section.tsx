import { type ReactNode, useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import { BatchPanel, SessionBatchPanel } from "glass-ux-image/panels/batch";
import { createEditorSession } from "glass-ux-image/session";
import { batchTool } from "glass-ux-image/tools/export";

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

function BatchPanelSample() {
  const [completed, setCompleted] = useState<number | null>(null);
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <BatchPanel
        renderOne={async (blob, settings) => {
          // The host renders each file. Here: open it, then encode it with the chosen settings.
          const editor = createEditorSession({ source: blob });
          try {
            await new Promise<void>((resolve, reject) => {
              const check = () => {
                if (editor.state.status === "ready") {
                  stop();
                  resolve();
                } else if (editor.state.status === "failed") {
                  stop();
                  reject(editor.state.error);
                }
              };
              const stop = editor.subscribe(check);
              check();
            });
            return await editor.result().toBlob({
              type: settings.format,
              quality: settings.quality,
              width: settings.width,
              height: settings.height,
            });
          } finally {
            editor.dispose();
          }
        }}
        onComplete={(results) =>
          setCompleted(results.filter((r) => r.status === "fulfilled").length)
        }
      />
      <output aria-live="polite" className="type-caption text-fg-muted">
        {completed === null ? "Add pictures to export them." : `${completed} exported`}
      </output>
    </div>
  );
}

function SessionBatchPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [batchTool] });
  return (
    <Stage editor={editor}>
      <SessionBatchPanel />
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Batch export"
        description="Exports many files with one format, quality and size. The host renders each file and decides where the results go; nothing is uploaded or saved by the panel."
      >
        <div data-live-demo="batch-panel" className="w-full">
          <BatchPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="With the open picture's edits"
        description="Applies the current picture's recipe to every file in the batch, for a set that should match."
      >
        <div data-live-demo="session-batch-panel" className="w-full">
          <SessionBatchPanelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
