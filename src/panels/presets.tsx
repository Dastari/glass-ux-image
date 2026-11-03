import { Tree } from 'glass-ux/tree';
import { IconAdjust } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { type ReactNode, useState } from 'react';
import { workspaceMessages, type WorkspaceMessages } from '../messages/workspace.js';
import { useEditor } from '../react/index.js';
import type { EditorSession, EditRecipe } from '../session/index.js';
/** A host-labelled recipe patch; no filter implementation is imported by this panel. */
export interface ImagePreset {
  /** Stable preset identity. */
  id: string;
  /** Optional host-selected icon. */
  icon?: ReactNode;
  /** Localised name, also used for the history step. */
  label: string;
  /** Patch applied over the picture as it was opened. Filter parameters merge by filter id. */
  change: Partial<EditRecipe>;
}
/** Presets remain host data, usable without a session. */
export interface PresetsPanelProps {
  /** Presets whose rendering parts the host has registered. */
  presets: readonly ImagePreset[];
  /** Controlled selected preset. */
  selectedId?: string | null;
  /** Initial selected preset. */
  defaultSelectedId?: string | null;
  /** Receives a choice; this plain panel does not edit a picture. */
  onSelectedIdChange?: (id:string, preset:ImagePreset)=>void;
  /** Localised words. */
  labels?: Partial<WorkspaceMessages>;
}
/** Keyboard-operable preset list on the shared Tree. */
export function PresetsPanel({presets,selectedId,defaultSelectedId=null,onSelectedIdChange,labels}:PresetsPanelProps) {
  const [own,setOwn]=useState(defaultSelectedId),m=useMessages(workspaceMessages,{labels});
  return <Tree aria-label={m.presets} selectedId={selectedId===undefined?own:selectedId} nodes={presets.map(p=>({id:p.id,label:p.label,icon:p.icon??<IconAdjust/>}))} onSelectedIdChange={id=>{if(!id)return;if(selectedId===undefined)setOwn(id);const preset=presets.find(p=>p.id===id);if(preset)onSelectedIdChange?.(id,preset);}}/>;
}
/** Session-bound preset list. */
export interface SessionPresetsPanelProps extends PresetsPanelProps {
  /** Explicit editor, or the nearest provider. */
  editor?: EditorSession;
}
/**
 * Choosing a preset starts again: it runs `edit.restart`, so the preset applies to the picture as
 * it was opened, earlier steps leave the history, and Undo returns to the original. A host can
 * refuse or replace that action through `onAction`.
 */
export function SessionPresetsPanel({editor,...props}:SessionPresetsPanelProps) {
  const session=useEditor(editor);
  return <PresetsPanel {...props} onSelectedIdChange={(id,preset)=>{const opened=session.history.nodes.find(node=>node.parent===null)!.recipe;session.restart({...preset.change,...(preset.change.filters?{filters:{...opened.filters,...preset.change.filters}}:{})},{label:preset.label});props.onSelectedIdChange?.(id,preset);}}/>;
}
