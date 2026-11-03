import { type ReactNode, useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import type { EncodeOptions } from "glass-ux-image/io";
import { ExportPanel, SessionExportPanel } from "glass-ux-image/panels/export";
import { FilesPanel, exportTool, filesTool } from "glass-ux-image/tools/export";

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

function ExportPanelSample() {
  const [settings, setSettings] = useState<EncodeOptions>({
    type: "image/webp",
    quality: 0.82,
    metadata: "strip",
  });
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <ExportPanel value={settings} onValueChange={setSettings} />
      <output aria-live="polite" className="type-caption text-fg-muted">
        {settings.type}, quality {Math.round((settings.quality ?? 1) * 100)}%, metadata{" "}
        {settings.metadata ?? "preserve"}
      </output>
    </div>
  );
}

function SessionExportPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [exportTool] });
  return (
    <Stage editor={editor}>
      <SessionExportPanel />
    </Stage>
  );
}

function FilesPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [filesTool] });
  return (
    <Stage editor={editor}>
      <FilesPanel />
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Output settings"
        description="Format, quality and metadata as one plain value, with no session. Formats the browser cannot encode are disabled."
      >
        <div data-live-demo="export-panel" className="w-full">
          <ExportPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Export the open picture"
        description="Encodes the session's picture with a live preview of the compressed result. The host's onSave decides what delivery means; the panel never uploads or saves by itself."
      >
        <div data-live-demo="session-export-panel" className="w-full">
          <SessionExportPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Files"
        description="Open, paste, project and recovery actions, through file adapters the host supplies. The library never reads or writes storage by itself."
      >
        <div data-live-demo="files-panel" className="w-full">
          <FilesPanelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
