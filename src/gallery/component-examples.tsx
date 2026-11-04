// Short public usage for the parts that work on an editor session. The docs kit shows each
// `<Name>Example` as that component's Usage, in place of the section specimen and its framing.

import { useEffect } from "react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import { BeforeAfter, ToolRail, ToolSettings } from "glass-ux-image/editor";
import { PhotoEditorActions, PhotoEditorStatus } from "glass-ux-image/photo-editor";
import { HistogramPanel } from "glass-ux-image/panels/histogram";
import { HistoryPanel } from "glass-ux-image/panels/history";
import { SessionLayersPanel } from "glass-ux-image/panels/layers";
import { SessionMetadataPanel } from "glass-ux-image/panels/metadata";
import { SessionPresetsPanel, type ImagePreset } from "glass-ux-image/panels/presets";
import { SessionExportPanel } from "glass-ux-image/panels/export";
import { SessionBatchPanel } from "glass-ux-image/panels/batch";
import { SessionBlendModeSelect } from "glass-ux-image/controls/blend-mode";
import { BasicPanel, basicDevelop } from "glass-ux-image/tools/develop/basic";
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
import { EffectsStackPanel, FilterGalleryPanel, effects } from "glass-ux-image/tools/effects";
import { FilesPanel, batchTool, exportTool, filesTool, metadataTool } from "glass-ux-image/tools/export";
import { layers } from "glass-ux-image/tools/layers";
import { TransformTarget, move } from "glass-ux-image/tools/move";
import { RetouchOverlay, RetouchPanel } from "glass-ux-image/tools/retouch";
import { brush } from "glass-ux-image/tools/retouch/brush";
import { cloneStamp } from "glass-ux-image/tools/retouch/clone";
import { SessionTextOverlay, SessionTextPanel, addTextLayer, defaultTextSpec, text } from "glass-ux-image/tools/text";
import { crop } from "glass-ux-image/tools/crop";

// Your picture: a URL, Blob or File.
const photo = `${import.meta.env.BASE_URL}sample.png`;
const tools = [crop, develop, brush, text, effects];

// Sample edits, so history, comparison and layer parts have something to show.
function addEdits(editor: EditorSession) {
  editor.run("edit.commit", { change: { filters: { develop: { exposure: 0.3 } } }, options: { label: "Exposure" } });
  editor.run("edit.commit", { change: { filters: { develop: { exposure: 0.3, shadows: 45 } } }, options: { label: "Shadows" } });
}
async function addCaption(editor: EditorSession) {
  const caption = { ...defaultTextSpec, content: "Lake at dusk", fontSize: 96, lineHeight: 112 };
  const id = await addTextLayer(editor, caption, [110, 200], "Caption", "Add caption");
  if (id) editor.setToolData("layers.selectedId", id);
}
function addEffects(editor: EditorSession) {
  editor.run("effects.add", { label: "Add vignette", entry: { id: "vignette-1", filter: "vignette", params: { amount: 1, radius: 2 }, strength: 0.8 } });
}
const presets: ImagePreset[] = [
  { id: "warm", label: "Golden hour", change: { filters: { develop: { temperature: 35, exposure: 0.2 } } } },
  { id: "mono", label: "Black and white", change: { filters: { develop: { saturation: -100, contrast: 25 } } } },
];

export function BasicPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [basicDevelop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <BasicPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function HistogramPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [basicDevelop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <HistogramPanel />
          <BasicPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function DevelopBasicPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <DevelopBasicPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function ToneCurvePanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <ToneCurvePanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function DevelopLevelsPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <DevelopLevelsPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function HslPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <HslPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function ColourBalancePanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <ColourBalancePanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function DetailPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <DetailPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function DevelopCompareExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addEdits(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <div className="relative min-w-0 flex-1">
          <DevelopCompare maxEdge={1200} />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function DevelopCompareOverlayExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <div className="relative min-w-0 flex-1">
          <ImageCanvas aria-label="Photo" className="absolute inset-0" />
          <DevelopCompareOverlay />
        </div>
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <DevelopBasicPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function BeforeAfterExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addEdits(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <div className="relative min-w-0 flex-1">
          <BeforeAfter maxEdge={1200} />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function HistoryPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addEdits(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <HistoryPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionPresetsPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <SessionPresetsPanel presets={presets} />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function ToolSettingsExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <ToolSettings tool={develop} />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function ToolRailExample() {
  const editor = useImageEditor({ source: photo, tools: tools });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 flex-col overflow-hidden rounded-surface border border-line">
        <div className="flex min-h-12 items-center border-b border-line px-3"><ToolRail tools={tools} /></div>
        <ImageCanvas aria-label="Photo" className="min-h-0 flex-1" />
      </div>
    </ImageEditorProvider>
  );
}

export function PhotoEditorActionsExample() {
  const editor = useImageEditor({ source: photo, tools: [develop] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addEdits(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 flex-col overflow-hidden rounded-surface border border-line">
        <div className="flex min-h-12 items-center border-b border-line px-3"><PhotoEditorActions /></div>
        <ImageCanvas aria-label="Photo" className="min-h-0 flex-1" />
      </div>
    </ImageEditorProvider>
  );
}

export function PhotoEditorStatusExample() {
  const editor = useImageEditor({ source: photo, tools: tools });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 flex-col overflow-hidden rounded-surface border border-line">
        <div className="flex min-h-12 items-center border-b border-line px-3"><PhotoEditorStatus /></div>
        <ImageCanvas aria-label="Photo" className="min-h-0 flex-1" />
      </div>
    </ImageEditorProvider>
  );
}

export function EffectsStackPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [effects] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addEffects(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <EffectsStackPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function FilterGalleryPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [effects] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <FilterGalleryPanel category="light" />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionLayersPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [layers, text] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addCaption(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <SessionLayersPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionBlendModeSelectExample() {
  const editor = useImageEditor({ source: photo, tools: [layers, text] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addCaption(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <SessionBlendModeSelect />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function TransformTargetExample() {
  const editor = useImageEditor({ source: photo, tools: [move, text] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addCaption(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <TransformTarget />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionTextPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [text] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addCaption(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <SessionTextPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionTextOverlayExample() {
  const editor = useImageEditor({ source: photo, tools: [text] });
  const { status } = useSessionState(editor);
  // Once, when the photo opens: a fresh session has nothing to undo.
  useEffect(() => { if (status === "ready" && !editor.state.canUndo) void addCaption(editor); }, [editor, status]);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1">
          <SessionTextOverlay />
        </ImageCanvas>
      </div>
    </ImageEditorProvider>
  );
}

export function RetouchPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [cloneStamp] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <RetouchPanel kind="clone" />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function RetouchOverlayExample() {
  const editor = useImageEditor({ source: photo, tools: [brush] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1">
          <RetouchOverlay kind="brush" />
        </ImageCanvas>
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <RetouchPanel kind="brush" />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function FilesPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [filesTool] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <FilesPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionExportPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [exportTool] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <SessionExportPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionMetadataPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [metadataTool] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <SessionMetadataPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export function SessionBatchPanelExample() {
  const editor = useImageEditor({ source: photo, tools: [batchTool] });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Photo" className="min-w-0 flex-1" />
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-s border-line p-4">
          <SessionBatchPanel />
        </div>
      </div>
    </ImageEditorProvider>
  );
}
