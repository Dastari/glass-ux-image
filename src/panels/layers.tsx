import { Notice } from 'glass-ux/notice';
import { type ReactNode, useRef, useState } from "react";
import { Tree, TreeMoveItems, moveTreeNodes, type TreeHandle } from "glass-ux/tree";
import { DragDropProvider } from "glass-ux/drag-drop";
import { ContextMenu } from "glass-ux/context-menu";
import { Menu } from "glass-ux/menu";
import { Button } from "glass-ux/button";
import { Switch } from "glass-ux/switch";
import { PercentInput } from "glass-ux/percent-field";
import { SettingRow } from "glass-ux/setting-row";
import { IconClipboard, IconCollapseAll, IconImage, IconText, IconLayers, IconMoreHorizontal, IconPlus } from "glass-ux/icons";
import { EmptyState } from "glass-ux/empty-state";
import { Toolbar } from "glass-ux/toolbar";
import { PanelGroup } from "../react/panel-layout.js";
import { useMessages } from "glass-ux/i18n";
import type { LayerSpec } from "../core/layers.js";
import { layersMessages } from "../messages/layers.js";
import { BlendModeSelect } from "../controls/blend-mode.js";
import { useEditor, useLayers } from "../react/session-context.js";
import type { EditorSession } from "../session/index.js";
import { addImageLayer, mergeLayerRange, flattenImage } from "../tools/layers/operations.js";
import { createId } from '../core/id.js';

/** Controlled layer list, bottom first; all editing is delegated to the host. */
export interface LayersPanelProps {
  /** Plain layer values in compositing order. */
  layers: readonly LayerSpec[];
  /** Icons for host-registered layer kinds. */
  kindIcons?: Readonly<Record<string, ReactNode>>;
  /** Controlled selection, or undefined for local selection. */
  selectedId?: string | null;
  /** Initial selection for uncontrolled use. */
  defaultSelectedId?: string | null;
  /** Reports selection without changing the layer data. */
  onSelectedIdChange?: (id: string | null) => void;
  /** Reports a complete list and a translated history label. */
  onLayersChange: (layers: readonly LayerSpec[], label: string) => void;
  /** Host opens a file chooser; absent hides the action. */
  onAddImage?: () => void;
  /** Host reads its clipboard; absent hides the action. */
  onPasteImage?: () => void;
  /** Bake the selected layer with the one below. Absent hides the action. */
  onMergeDown?: (id: string) => void;
  /** Bake the visible picture to a single base with no editable layers. Absent hides the action. */
  onFlatten?: () => void;
  /** Reports an operational error to the host. */
  error?: string | null;
  /** Disable asynchronous conflicting edits while baking or importing. */
  busy?: boolean;
}
/** Glass UX tree with drag reorder, Alt+Arrow reorder, F2 rename and row action menus. */
export function LayersPanel(props: LayersPanelProps) {
  const { layers, onLayersChange, busy } = props;
  const m = useMessages(layersMessages), tree = useRef<TreeHandle>(null);
  const [local, setLocal] = useState(props.defaultSelectedId ?? null);
  const selectedId = props.selectedId === undefined ? local : props.selectedId;
  const select = (id: string | null) => { if (props.selectedId === undefined) setLocal(id); props.onSelectedIdChange?.(id); };
  const selected = layers.find(layer => layer.id === selectedId);
  const patch = (id: string, changes: Partial<LayerSpec>, label: string) => onLayersChange(layers.map(layer => layer.id === id ? { ...layer, ...changes } : layer), label);
  const nodes = [...layers].reverse().map(layer => ({ id: layer.id, label: layer.name, icon: props.kindIcons?.[layer.kind] ?? (layer.kind === "text" ? <IconText /> : <IconImage />), hasChildren: false, disabled: busy }));
  const actions = (id: string, menu: boolean) => {
    const Parts = menu ? Menu : ContextMenu;
    const layer = layers.find(item => item.id === id)!;
    return <>
      <Parts.Item onClick={() => tree.current?.rename(id)}>{m.rename}</Parts.Item>
      <Parts.Item onClick={() => {
        const copy = { ...layer, id: createId() };
        const index = layers.indexOf(layer);
        onLayersChange([...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)], m.duplicate); select(copy.id);
      }}>{m.duplicate}</Parts.Item>
      <Parts.CheckboxItem checked={layer.visible} onCheckedChange={visible => patch(id, { visible }, m.visibility)}>{m.visibility}</Parts.CheckboxItem>
      <TreeMoveItems tree={tree} id={id} />
      {props.onMergeDown && layers.indexOf(layer) > 0 && <Parts.Item onClick={() => props.onMergeDown?.(id)}>{m.mergeDown}</Parts.Item>}
      <Parts.Item tone="danger" onClick={() => { onLayersChange(layers.filter(item => item.id !== id), m.deleteLayer); if (selectedId === id) select(null); }}>{m.deleteLayer}</Parts.Item>
    </>;
  };
  return <div className="gi-layers-panel" aria-busy={busy}>
    {(props.onAddImage || props.onPasteImage || props.onFlatten) && <Toolbar aria-label={m.layers} overflow={false}>
      {props.onAddImage && <Toolbar.Button label={m.addImage} icon={<IconPlus />} disabled={busy} onClick={props.onAddImage} />}
      {props.onPasteImage && <Toolbar.Button label={m.paste} icon={<IconClipboard />} disabled={busy} onClick={props.onPasteImage} />}
      {props.onFlatten && <><Toolbar.Spacer /><Toolbar.Button label={m.flatten} icon={<IconCollapseAll />} disabled={busy || layers.length === 0} onClick={props.onFlatten} /></>}
    </Toolbar>}
    <div className="gi-layers-list">{layers.length === 0 ? <EmptyState icon={<IconLayers />}>{m.noLayers}</EmptyState> : <DragDropProvider><Tree ref={tree} aria-label={m.layers} nodes={nodes} selectedId={selectedId} onSelectedIdChange={select}
      canMove={move => !busy && move.parentId === null}
      onMove={move => { const next = moveTreeNodes(nodes, move); onLayersChange(next.reverse().map(node => layers.find(layer => layer.id === node.id)!), m.layers); }}
      onRename={(id, name) => { if (!name.trim()) return false; patch(id, { name: name.trim() }, m.rename); }}
      rowWrapper={(node, row) => <ContextMenu.Root key={node.id}><ContextMenu.Trigger render={row} /><ContextMenu.Popup>{actions(node.id, false)}</ContextMenu.Popup></ContextMenu.Root>}
      renderTrailing={node => <Menu.Root><Menu.Trigger render={<Button size="sm" variant="ghost" tabIndex={-1} aria-label={m.layerActions(node.label)} icon={<IconMoreHorizontal />} />} /><Menu.Popup>{actions(node.id, true)}</Menu.Popup></Menu.Root>}
    /></DragDropProvider>}</div>
    {selected && <PanelGroup label={selected.name}>
      <SettingRow label={m.visibility} control={<Switch size="sm" aria-label={m.visibility} disabled={busy} checked={selected.visible} onCheckedChange={visible => patch(selected.id, { visible }, m.visibility)} />} />
      <SettingRow label={m.opacity} control={<PercentInput scale="fraction" size="sm" width="short" steppers={false} aria-label={m.opacity} disabled={busy} min={0} max={1} value={selected.opacity} onValueChange={value => value !== null && patch(selected.id, { opacity: value }, m.opacity)} />} />
      <SettingRow label={m.blend} control={<BlendModeSelect disabled={busy} value={selected.blend} onValueChange={blend => patch(selected.id, { blend }, m.blend)} />} />
    </PanelGroup>}
    <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: props.error ? undefined : "hidden"}}>{props.error}</Notice></div>
  </div>;
}
/** Session-bound layer panel. */
export interface SessionLayersPanelProps {
  /** Icons for host-registered layer kinds. */
  kindIcons?: Readonly<Record<string, ReactNode>>;
  /** Explicit session, or the nearest provider. */
  session?: EditorSession;
}
/** Image import and baking use public session actions; the view itself remains reusable. */
export function SessionLayersPanel({ session, kindIcons }: SessionLayersPanelProps) {
  const editor = useEditor(session), layers = useLayers(editor), m = useMessages(layersMessages);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); } catch { setError(m.failed); } finally { setBusy(false); }
  };
  return <div onPaste={event => {
    const image = [...event.clipboardData.files].find(file => file.type.startsWith("image/"));
    if (!image || busy) return;
    event.preventDefault();
    void perform(async () => { const id = await addImageLayer(editor, image, image.name || m.addImage, m.paste); if (id) layers.select(id); });
  }}>
    <input ref={input} hidden type="file" accept="image/*" aria-label={m.addImage} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (file) void perform(async () => { const id = await addImageLayer(editor, file, file.name, m.addImage); if (id) layers.select(id); });
    }} />
    <LayersPanel {...layers} kindIcons={kindIcons} onSelectedIdChange={layers.select} onLayersChange={layers.set} busy={busy} error={error}
      onAddImage={() => input.current?.click()}
      onPasteImage={() => void perform(async () => {
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find(type => type.startsWith("image/"));
          if (type) { const id = await addImageLayer(editor, await item.getType(type), m.addImage, m.paste); if (id) layers.select(id); return; }
        }
        throw new Error("Clipboard has no image");
      })}
      onMergeDown={id => void perform(() => mergeLayerRange(editor, id, m.mergeDown))}
      onFlatten={() => void perform(() => flattenImage(editor, m.flatten))} />
  </div>;
}
/** Layer-tool icon exported separately from text. */
export const layersIcon = <IconLayers />;
