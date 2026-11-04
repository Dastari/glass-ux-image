import { Notice } from 'glass-ux/notice';
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { Tree, TreeMoveItems, moveTreeNodes, type TreeHandle } from "glass-ux/tree";
import { DragDropProvider } from "glass-ux/drag-drop";
import { ContextMenu } from "glass-ux/context-menu";
import { Menu } from "glass-ux/menu";
import { Button } from "glass-ux/button";
import { Switch } from "glass-ux/switch";
import { Segmented } from "glass-ux/segmented";
import { PercentInput } from "glass-ux/percent-field";
import { SettingRow } from "glass-ux/setting-row";
import { IconChevronDown, IconClipboard, IconCollapseAll, IconContrast, IconImage, IconText, IconLayers, IconMoreHorizontal, IconPlus } from "glass-ux/icons";
import { EmptyState } from "glass-ux/empty-state";
import { Toolbar } from "glass-ux/toolbar";
import { formatPercent, useLocale } from "glass-ux/locale";
import { PanelGroup, PanelHint } from "../react/panel-layout.js";
import { useMessages } from "glass-ux/i18n";
import { BLEND_MODES } from "../core/document.js";
import type { LayerMask, LayerSpec } from "../core/index.js";
import { layersMessages } from "../messages/layers.js";
import { BlendModeSelect, blendModeKeys } from "../controls/blend-mode.js";
import { useEditor, useLayers, useSessionState } from "../react/session-context.js";
import type { EditorSession } from "../session/index.js";
import { addImageLayer, duplicateLayer, mergeLayerRange, flattenImage, removeLayer } from "../tools/layers/operations.js";
import { createId } from '../core/id.js';
import { LayerThumbnail } from "./layers-thumbnail.js";
import { IMAGE_IMPORT_ACCEPT } from "../io/formats/index.js";

/** Which part of a layer takes strokes. */
export type LayerPaintTarget = "pixels" | "mask";
/** Rows the list shows before it scrolls. */
const VISIBLE_ROWS = 5;

/** Controlled layer list, bottom first; all editing is delegated to the host. */
export interface LayersPanelProps {
  /** Plain layer values in compositing order. */
  layers: readonly LayerSpec[];
  /** Icons for host-registered layer kinds. */
  kindIcons?: Readonly<Record<string, ReactNode>>;
  /** Draw a layer's or its mask's thumbnail. Absent shows the kind's icon and a mask glyph. */
  renderThumbnail?: (layer: LayerSpec, part: LayerPaintTarget) => ReactNode;
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
  /** Copy a layer with what belongs to it, such as its strokes. Absent copies the layer alone. */
  onDuplicate?: (id: string) => void;
  /** Delete a layer with what belongs to it. Absent removes the layer alone. */
  onRemove?: (id: string) => void;
  /** Which layers can take a mask. Default: image layers. */
  canMask?: (layer: LayerSpec) => boolean;
  /** Add a mask. Absent adds it through `onLayersChange`. */
  onAddMask?: (id: string, fill: LayerMask["fill"]) => void;
  /** Turn a mask on or off. Absent changes it through `onLayersChange`. */
  onMaskEnabledChange?: (id: string, enabled: boolean) => void;
  /** Delete a mask with its strokes. Absent removes it through `onLayersChange`. */
  onDeleteMask?: (id: string) => void;
  /** Bake a mask into its layer's pixels. Absent hides the action. */
  onApplyMask?: (id: string) => void;
  /** Whether the selected layer's pixels or mask take strokes. Absent hides the choice. */
  paintTarget?: LayerPaintTarget;
  /** Reports a new paint target, from the choice or a click on a thumbnail. */
  onPaintTargetChange?: (target: LayerPaintTarget) => void;
  /** Reports an operational error to the host. */
  error?: string | null;
  /** Disable asynchronous conflicting edits while baking or importing. */
  busy?: boolean;
}

/** Glass UX tree with thumbnails, drag reorder, Alt+Arrow reorder, F2 rename, row menus and masks. */
export function LayersPanel(props: LayersPanelProps) {
  const { layers, onLayersChange, busy } = props;
  const m = useMessages(layersMessages), locale = useLocale(), tree = useRef<TreeHandle>(null);
  const [local, setLocal] = useState(props.defaultSelectedId ?? null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const selectedId = props.selectedId === undefined ? local : props.selectedId;
  const select = (id: string | null) => { if (props.selectedId === undefined) setLocal(id); props.onSelectedIdChange?.(id); };
  const selected = layers.find(layer => layer.id === selectedId);
  const canMask = props.canMask ?? ((layer: LayerSpec) => layer.kind === "image");
  const target = props.paintTarget ?? "pixels";
  const patch = (id: string, changes: Partial<LayerSpec>, label: string) => onLayersChange(layers.map(layer => layer.id === id ? { ...layer, ...changes } : layer), label);
  const blendName = (layer: LayerSpec) => m[blendModeKeys[BLEND_MODES.indexOf(layer.blend)] ?? "normalMode"];
  // Opacity always, the blend only when it is not Normal, and Hidden: what differs from a plain layer.
  const describe = (layer: LayerSpec) => [...(layer.blend === "normal" ? [] : [blendName(layer)]), formatPercent(locale, layer.opacity * 100, 0), ...(layer.visible ? [] : [m.hiddenLayer])].join(m.separator);
  const nodes = [...layers].reverse().map(layer => ({ id: layer.id, label: layer.name, description: describe(layer), icon: icon(layer), hasChildren: false, disabled: busy }));
  function icon(layer: LayerSpec) { return props.kindIcons?.[layer.kind] ?? (layer.kind === "text" ? <IconText /> : <IconImage />); }

  const addMask = (id: string, fill: LayerMask["fill"]) => {
    if (props.onAddMask) props.onAddMask(id, fill); else patch(id, { mask: { fill, enabled: true } }, m.addMask);
    select(id); props.onPaintTargetChange?.("mask");
  };
  const enableMask = (layer: LayerSpec, enabled: boolean) => {
    if (props.onMaskEnabledChange) props.onMaskEnabledChange(layer.id, enabled);
    else if (layer.mask) patch(layer.id, { mask: { ...layer.mask, enabled } }, enabled ? m.enableMask : m.disableMask);
  };
  const deleteMask = (layer: LayerSpec) => {
    if (props.onDeleteMask) props.onDeleteMask(layer.id);
    else { const { mask: _mask, ...rest } = layer; onLayersChange(layers.map(item => item.id === layer.id ? rest : item), m.deleteMask); }
    if (layer.id === selectedId) props.onPaintTargetChange?.("pixels");
  };

  const actions = (id: string, menu: boolean) => {
    const Parts = menu ? Menu : ContextMenu;
    const layer = layers.find(item => item.id === id)!;
    return <>
      <Parts.Item onClick={() => tree.current?.rename(id)}>{m.rename}</Parts.Item>
      <Parts.Item onClick={() => {
        if (props.onDuplicate) { props.onDuplicate(id); return; }
        const copy = { ...layer, id: createId() };
        const index = layers.indexOf(layer);
        onLayersChange([...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)], m.duplicate); select(copy.id);
      }}>{m.duplicate}</Parts.Item>
      <Parts.CheckboxItem checked={layer.visible} onCheckedChange={visible => patch(id, { visible }, m.visibility)}>{m.visibility}</Parts.CheckboxItem>
      <TreeMoveItems tree={tree} id={id} />
      {canMask(layer) && <>
        <Parts.Separator />
        {layer.mask ? <>
          <Parts.CheckboxItem checked={layer.mask.enabled} onCheckedChange={enabled => enableMask(layer, enabled)}>{m.enableMask}</Parts.CheckboxItem>
          {props.onApplyMask && <Parts.Item onClick={() => props.onApplyMask?.(id)}>{m.applyMask}</Parts.Item>}
          <Parts.Item onClick={() => deleteMask(layer)}>{m.deleteMask}</Parts.Item>
        </> : <>
          <Parts.Item onClick={() => addMask(id, "reveal")}>{`${m.addMask}: ${m.revealAll}`}</Parts.Item>
          <Parts.Item onClick={() => addMask(id, "hide")}>{`${m.addMask}: ${m.hideAll}`}</Parts.Item>
        </>}
        <Parts.Separator />
      </>}
      {props.onMergeDown && layers.indexOf(layer) > 0 && <Parts.Item onClick={() => props.onMergeDown?.(id)}>{m.mergeDown}</Parts.Item>}
      <Parts.Item tone="danger" onClick={() => {
        if (props.onRemove) props.onRemove(id); else onLayersChange(layers.filter(item => item.id !== id), m.deleteLayer);
        if (selectedId === id) select(null);
      }}>{m.deleteLayer}</Parts.Item>
    </>;
  };

  /** A pointer shortcut to the paint target; the Paint on choice is the keyboard path. */
  const thumb = (layer: LayerSpec, part: LayerPaintTarget) => {
    const current = layer.id === selectedId && props.paintTarget !== undefined && target === part && Boolean(layer.mask);
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the Paint on choice is the keyboard path
    return <span className="gi-layer-thumb" data-part={part} data-current={current ? "" : undefined}
      data-off={part === "mask" && !layer.mask?.enabled ? "" : undefined}
      onClick={() => { if (layer.mask && props.onPaintTargetChange) props.onPaintTargetChange(part); }}>
      {props.renderThumbnail?.(layer, part) ?? <span className="gi-layer-thumb-glyph">{part === "mask" ? <IconContrast /> : icon(layer)}</span>}
    </span>;
  };

  const rows = Math.min(layers.length, VISIBLE_ROWS);
  return <div className="gi-layers-panel" aria-busy={busy}>
    {(props.onAddImage || props.onPasteImage || props.onFlatten) && <Toolbar aria-label={m.layers} overflow={false}>
      {props.onAddImage && <Toolbar.Button label={m.addImage} icon={<IconPlus />} disabled={busy} onClick={props.onAddImage} />}
      {props.onPasteImage && <Toolbar.Button label={m.paste} icon={<IconClipboard />} disabled={busy} onClick={props.onPasteImage} />}
      {props.onFlatten && <><Toolbar.Spacer /><Toolbar.Button label={m.flatten} icon={<IconCollapseAll />} disabled={busy || layers.length === 0} onClick={props.onFlatten} /></>}
    </Toolbar>}
    <div className="gi-layers-list" data-empty={layers.length === 0 ? "" : undefined} style={{ "--gi-layer-rows": rows } as CSSProperties}>
      {layers.length === 0 ? <EmptyState icon={<IconLayers />}>{m.noLayers}</EmptyState> : <DragDropProvider><Tree ref={tree} aria-label={m.layers} nodes={nodes} selectedId={selectedId} onSelectedIdChange={select}
        canMove={move => !busy && move.parentId === null}
        onMove={move => { const next = moveTreeNodes(nodes, move); onLayersChange(next.reverse().map(node => layers.find(layer => layer.id === node.id)!), m.layers); }}
        onRenamingIdChange={setRenaming}
        onRename={(id, name) => { if (!name.trim()) return false; patch(id, { name: name.trim() }, m.rename); }}
        renderContent={(node, content) => {
          const layer = layers.find(item => item.id === node.id);
          if (!layer) return null;
          return <>
            <span className="gi-layer-thumbs" data-hidden={layer.visible ? undefined : ""} aria-hidden>
              {thumb(layer, "pixels")}
              {layer.mask && thumb(layer, "mask")}
            </span>
            <span className="fa-tree-text">
              {node.id === renaming ? content.label : <span className="fa-tree-label" title={node.label}>{content.label}</span>}
              {content.description !== null && <span className="fa-tree-description" title={node.description}>{content.description}</span>}
            </span>
          </>;
        }}
        trailingVisibility="hover"
        rowWrapper={(node, row) => <ContextMenu.Root key={node.id}><ContextMenu.Trigger render={row} /><ContextMenu.Popup>{actions(node.id, false)}</ContextMenu.Popup></ContextMenu.Root>}
        renderTrailing={node => <Menu.Root><Menu.Trigger render={<Button size="sm" variant="ghost" tabIndex={-1} aria-label={m.layerActions(node.label)} icon={<IconMoreHorizontal />} />} /><Menu.Popup>{actions(node.id, true)}</Menu.Popup></Menu.Root>}
      /></DragDropProvider>}
    </div>
    {selected && <PanelGroup label={selected.name}>
      <SettingRow label={m.visibility} control={<Switch size="sm" aria-label={m.visibility} disabled={busy} checked={selected.visible} onCheckedChange={visible => patch(selected.id, { visible }, m.visibility)} />} />
      <SettingRow label={m.opacity} control={<PercentInput scale="fraction" size="sm" width="short" steppers={false} aria-label={m.opacity} disabled={busy} min={0} max={1} value={selected.opacity} onValueChange={value => value !== null && patch(selected.id, { opacity: value }, m.opacity)} />} />
      <SettingRow label={m.blend} control={<BlendModeSelect disabled={busy} value={selected.blend} onValueChange={blend => patch(selected.id, { blend }, m.blend)} />} />
      {canMask(selected) && (selected.mask ? <MaskCard layer={selected} busy={busy} thumbnail={thumb(selected, "mask")}
        target={props.paintTarget} onTargetChange={props.onPaintTargetChange}
        onEnabledChange={enabled => enableMask(selected, enabled)} onDelete={() => deleteMask(selected)}
        onApply={props.onApplyMask && (() => props.onApplyMask?.(selected.id))} />
        : <SettingRow label={m.mask} control={<Menu.Root>
          <Menu.Trigger render={<Button size="sm" variant="secondary" disabled={busy} icon={<IconPlus />} iconEnd={<IconChevronDown />}>{m.addMask}</Button>} />
          <Menu.Popup>
            <Menu.Item onClick={() => addMask(selected.id, "reveal")}>{m.revealAll}</Menu.Item>
            <Menu.Item onClick={() => addMask(selected.id, "hide")}>{m.hideAll}</Menu.Item>
          </Menu.Popup>
        </Menu.Root>} />)}
    </PanelGroup>}
    <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: props.error ? undefined : "hidden"}}>{props.error}</Notice></div>
  </div>;
}

/** The selected layer's mask: its thumbnail, an on/off switch, its actions and the paint target. */
function MaskCard({ layer, busy, thumbnail, target, onTargetChange, onEnabledChange, onDelete, onApply }: {
  layer: LayerSpec; busy?: boolean; thumbnail: ReactNode; target?: LayerPaintTarget;
  onTargetChange?: (target: LayerPaintTarget) => void; onEnabledChange: (enabled: boolean) => void;
  onDelete: () => void; onApply?: (() => void) | undefined;
}) {
  const m = useMessages(layersMessages), mask = layer.mask!;
  return <div className="gi-layer-mask" data-off={mask.enabled ? undefined : ""}>
    <div className="gi-layer-mask-head">
      <span className="gi-layer-mask-thumb" aria-hidden>{thumbnail}</span>
      <span className="gi-layer-mask-title">{m.mask}</span>
      <Switch size="sm" aria-label={m.enableMask} disabled={busy} checked={mask.enabled} onCheckedChange={onEnabledChange} />
      <Menu.Root>
        <Menu.Trigger render={<Button size="sm" variant="ghost" disabled={busy} aria-label={m.maskActions} icon={<IconMoreHorizontal />} />} />
        <Menu.Popup>
          {onApply && <Menu.Item onClick={onApply}>{m.applyMask}</Menu.Item>}
          <Menu.Item tone="danger" onClick={onDelete}>{m.deleteMask}</Menu.Item>
        </Menu.Popup>
      </Menu.Root>
    </div>
    {target !== undefined && onTargetChange && <SettingRow label={m.paintOn} control={<Segmented size="sm" value={target}
      onValueChange={value => value && onTargetChange(value)}
      options={[{ value: "pixels" as const, label: m.pixels }, { value: "mask" as const, label: m.mask }]} />} />}
    {target === "mask" && <PanelHint>{m.maskHint}</PanelHint>}
  </div>;
}

/** Session-bound layer panel props. */
export interface SessionLayersPanelProps {
  /** Icons for host-registered layer kinds. */
  kindIcons?: Readonly<Record<string, ReactNode>>;
  /** Explicit session, or the nearest provider. */
  session?: EditorSession;
}
/** Tool data shared with the retouch tools: whether the selected layer's mask takes strokes. */
const PAINT_MASK_KEY = "layers.paintMask";
/** Image import, masks and baking use public session actions; the view itself remains reusable. */
export function SessionLayersPanel({ session, kindIcons }: SessionLayersPanelProps) {
  const editor = useEditor(session), layers = useLayers(editor), m = useMessages(layersMessages);
  const { toolData } = useSessionState(editor);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); } catch { setError(m.failed); } finally { setBusy(false); }
  };
  const target: LayerPaintTarget = layers.selectedLayer?.mask && toolData[PAINT_MASK_KEY] === true ? "mask" : "pixels";
  return <div onPaste={event => {
    const image = [...event.clipboardData.files].find(file => file.type.startsWith("image/"));
    if (!image || busy) return;
    event.preventDefault();
    void perform(async () => { const id = await addImageLayer(editor, image, image.name || m.addImage, m.paste); if (id) layers.select(id); });
  }}>
    <input ref={input} hidden type="file" accept={IMAGE_IMPORT_ACCEPT} aria-label={m.addImage} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (file) void perform(async () => { const id = await addImageLayer(editor, file, file.name, m.addImage); if (id) layers.select(id); });
    }} />
    <LayersPanel {...layers} kindIcons={kindIcons} onSelectedIdChange={layers.select} onLayersChange={layers.set} busy={busy} error={error}
      renderThumbnail={(layer, part) => layer.kind === "image" ? <LayerThumbnail session={editor} id={layer.id} part={part} /> : null}
      paintTarget={target} onPaintTargetChange={next => editor.setToolData(PAINT_MASK_KEY, next === "mask")}
      onDuplicate={id => { const copy = duplicateLayer(editor, id, m.duplicate); if (copy) layers.select(copy); }}
      onRemove={id => removeLayer(editor, id, m.deleteLayer)}
      onAddMask={(id, fill) => editor.run("layers.mask.add", { id, fill, label: m.addMask })}
      onMaskEnabledChange={(id, enabled) => editor.run("layers.mask.enable", { id, enabled, label: enabled ? m.enableMask : m.disableMask })}
      onDeleteMask={id => editor.run("layers.mask.delete", { id, label: m.deleteMask })}
      onApplyMask={id => void perform(async () => { await editor.applyLayerMask(id, { label: m.applyMask }); editor.setToolData(PAINT_MASK_KEY, false); })}
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
