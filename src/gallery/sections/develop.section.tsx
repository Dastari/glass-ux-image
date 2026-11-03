import { type ReactNode, useEffect } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import {
  ColourBalancePanel,
  DetailPanel,
  DevelopBasicPanel,
  DevelopCompare,
  DevelopCompareOverlay,
  DevelopLevelsPanel,
  HslPanel,
  ToneCurvePanel,
  develop,
} from "glass-ux-image/tools/develop";

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

function DevelopBasicPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage editor={editor}>
      <DevelopBasicPanel />
    </Stage>
  );
}

function ToneCurvePanelSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage editor={editor}>
      <ToneCurvePanel />
    </Stage>
  );
}

function DevelopLevelsPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage editor={editor}>
      <DevelopLevelsPanel />
    </Stage>
  );
}

function HslPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage editor={editor}>
      <HslPanel />
    </Stage>
  );
}

function ColourBalancePanelSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage editor={editor}>
      <ColourBalancePanel />
    </Stage>
  );
}

function DetailPanelSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage editor={editor}>
      <DetailPanel />
    </Stage>
  );
}

function DevelopCompareSample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return <Stage editor={editor} canvas={<DevelopCompare maxEdge={1200} />} onReady={addEdits} />;
}

// Edits, then the comparison on, as the Basic section's compare button does.
function addEditsAndCompare(editor: EditorSession) {
  addEdits(editor);
  editor.setToolData("develop.compare", true);
}

function DevelopCompareOverlaySample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <Stage
      editor={editor}
      onReady={addEditsAndCompare}
      canvas={
        <>
          <ImageCanvas aria-label="Sample photo" className="absolute inset-0" />
          <DevelopCompareOverlay />
        </>
      }
    >
      <DevelopBasicPanel />
    </Stage>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Basic"
        description="The histogram, exposure, tone, white balance and colour: the controls most photos need. Exposure is in stops, applied in linear light."
      >
        <div data-live-demo="develop-basic-panel" className="w-full">
          <DevelopBasicPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Tone curve"
        description="An RGB curve and one per channel. Use it for contrast with a shape, or to tint shadows and highlights differently."
      >
        <div data-live-demo="tone-curve-panel" className="w-full">
          <ToneCurvePanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Levels"
        description="Black, gamma and white points for all channels or one, to stretch a flat photo or correct a cast."
      >
        <div data-live-demo="develop-levels-panel" className="w-full">
          <DevelopLevelsPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Hue, saturation and luminance"
        description="Eight colour ranges, each with its own hue, saturation and luminance. Neighbouring ranges overlap smoothly, so edits do not band."
      >
        <div data-live-demo="hsl-panel" className="w-full">
          <HslPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Colour balance"
        description="One colour wheel each for shadows, midtones and highlights, as in a grading suite."
      >
        <div data-live-demo="colour-balance-panel" className="w-full">
          <ColourBalancePanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Detail"
        description="Clarity, texture and dehaze: local contrast at three scales. They read neighbouring pixels, so they cost more than the global controls."
      >
        <div data-live-demo="detail-panel" className="w-full">
          <DetailPanelSample />
        </div>
      </Specimen>
      <Specimen
        title="Compare"
        description="The photo without its develop settings on one side and with them on the other. Both sides share the current crop and rotation."
      >
        <div data-live-demo="develop-compare" className="w-full">
          <DevelopCompareSample />
        </div>
      </Specimen>
      <Specimen
        title="Compare inside an editor"
        description="The same comparison as a canvas overlay, shown while the Basic section's compare button is on."
      >
        <div data-live-demo="develop-compare-overlay" className="w-full">
          <DevelopCompareOverlaySample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
