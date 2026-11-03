import { type ReactNode, useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import type { AdjustParams } from "glass-ux-image/filters/adjust";
import { BasicAdjustments, BasicPanel, basicDevelop } from "glass-ux-image/tools/develop/basic";

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

function BasicAdjustmentsSample() {
  const [value, setValue] = useState<AdjustParams>({
    brightness: 10,
    contrast: 15,
    saturation: 0,
    warmth: 20,
  });
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <BasicAdjustments value={value} onValueChange={setValue} />
      <output aria-live="polite" className="type-caption text-fg-muted">
        Brightness {value.brightness}, contrast {value.contrast}, saturation {value.saturation},
        warmth {value.warmth}
      </output>
    </div>
  );
}

function BasicPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [basicDevelop] });
  return (
    <Stage editor={editor}>
      <BasicPanel />
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Sliders on their own"
        description="Four plain values with no session. The host decides what they change, so they suit a settings form or a preset editor."
      >
        <div data-live-demo="basic-adjustments" className="w-full">
          <BasicAdjustmentsSample />
        </div>
      </Specimen>
      <Specimen
        title="On a photo"
        description="Bound to the nearest editor session. Dragging previews on the photo; letting go commits one undoable step."
      >
        <div data-live-demo="basic-panel" className="w-full">
          <BasicPanelSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
