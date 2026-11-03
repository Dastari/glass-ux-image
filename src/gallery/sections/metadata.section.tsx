import { type ReactNode } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import { MetadataPanel, SessionMetadataPanel } from "glass-ux-image/panels/metadata";
import { metadataTool } from "glass-ux-image/tools/export";

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

function MetadataPanelSample() {
  return (
    <div className="w-full max-w-sm">
      <MetadataPanel
        value={{
          format: "jpeg",
          packets: [],
          fields: {
            cameraMake: "Fujifilm",
            cameraModel: "X-T5",
            lens: "XF 16-55mm F2.8",
            exposureSeconds: 1 / 60,
            aperture: 8,
            iso: 400,
            focalLengthMm: 23,
            date: "2026:04:18 18:42:07",
            gps: { latitude: -44.0048, longitude: 170.4771 },
          },
          presence: { exif: true, xmp: false, iptc: false },
        }}
      />
    </div>
  );
}

function SessionMetadataPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [metadataTool] });
  return (
    <Stage editor={editor}>
      <SessionMetadataPanel />
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Camera details"
        description="Read-only fields from a parsed file, with no session. Use it beside a picture in a gallery or an upload form."
      >
        <div data-live-demo="metadata-panel" className="w-full">
          <MetadataPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="The open picture's metadata"
        description="The metadata and colour profile of the file the session opened, read from the original bytes. The sample PNG carries none, so the panel says so."
      >
        <div data-live-demo="session-metadata-panel" className="w-full">
          <SessionMetadataPanelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
