import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { resolveActions, useActionRunner, type ActionSet } from 'glass-ux/actions';
import { useShortcutCommands, type ShortcutCommand } from 'glass-ux/keymap';

/** Host key overrides by action id. A string or list replaces the defaults; null or [] turns a binding off. */
export type ShortcutOverrides = Readonly<Record<string, string | readonly string[] | null>>;

/**
 * Photoshop's tool keys, by tool id. Tools sharing a single-letter key form a group: the key picks
 * the group's current tool and Shift with the key steps to the next, in this order. A tool's own
 * `shortcut` applies when it is not listed here; a host's `shortcuts` replace either.
 */
export const PHOTOSHOP_TOOL_KEYS: Readonly<Record<string, string>> = {
  select: 'v', move: 'v',
  crop: 'c', straighten: 'c', perspective: 'c',
  rotate: 'r',
  'retouch.spot-heal': 'j', 'retouch.heal': 'j', 'retouch.patch': 'j', 'retouch.red-eye': 'j',
  'retouch.brush': 'b', 'retouch.colour-replace': 'b',
  'retouch.eraser': 'e',
  'retouch.clone': 's',
  'retouch.dodge': 'o', 'retouch.burn': 'o', 'retouch.sponge': 'o',
  text: 't',
  // Free Transform, Image Size, Canvas Size, Camera Raw Filter, Liquify, the Layers panel, Open,
  // Export As and File Info.
  transform: 'mod+t', resize: 'mod+alt+i', 'canvas-size': 'mod+alt+c',
  develop: 'mod+shift+a', 'basic-develop': 'mod+shift+a', 'retouch.liquify': 'mod+shift+x', layers: 'f7',
  'files.open': 'mod+o', 'files.export': 'mod+alt+shift+w', 'files.metadata': 'mod+alt+shift+i', info: 'mod+alt+shift+i',
};

/** Photoshop's keys for the editor's commands, by action id; the first is the one menus show. */
export const PHOTOSHOP_COMMAND_KEYS: Readonly<Record<string, readonly string[]>> = {
  'edit.undo': ['mod+z'], 'edit.redo': ['mod+shift+z'],
  'file.copy': ['mod+c'], 'file.paste': ['mod+v'], 'file.save': ['mod+s'],
  'view.fit': ['mod+0'], 'view.actualSize': ['mod+1'], 'view.zoomIn': ['mod+=', 'mod+plus'], 'view.zoomOut': ['mod+-'],
  'view.pan': ['space'],
  'layers.duplicate': ['mod+j'], 'layers.mergeDown': ['mod+e'], 'layers.mergeVisible': ['mod+shift+e'],
  'layers.selectAbove': ['alt+]'], 'layers.selectBelow': ['alt+['],
  'layers.delete': ['delete', 'backspace'], 'layers.deselect': ['escape'],
  'brush.smaller': ['['], 'brush.larger': [']'], 'brush.softer': ['{'], 'brush.harder': ['}'],
  'workspace.compare': ['\\'], 'workspace.mode': ['f'],
  'workspace.shortcuts': ['?', 'mod+alt+shift+k'], 'workspace.commands': ['mod+k'],
  'workspace.nextRegion': ['f6'], 'workspace.previousRegion': ['shift+f6'],
};

const asKeys = (keys: string | readonly string[] | null | undefined): readonly string[] => keys == null ? [] : typeof keys === 'string' ? [keys] : keys;
/** A single letter with no modifier: Shift with it cycles a group. */
const cycles = (key: string | undefined): key is string => !!key && /^[a-z]$/i.test(key);

/** The default keys for a tool: Photoshop's, else the tool's own. */
export function toolKeys(id: string, own?: string): readonly string[] {
  return asKeys(PHOTOSHOP_TOOL_KEYS[id] ?? own);
}
/** The keys in effect for an action: the host's override, else the defaults. */
export function keysFor(id: string, defaults: readonly string[], overrides?: ShortcutOverrides): readonly string[] {
  return overrides && id in overrides ? asKeys(overrides[id]) : defaults;
}

/** Tools sharing one letter, in Photoshop's order, then the order the host listed them. */
export interface ToolKeyGroup { key: string; tools: readonly string[] }
/** Group tools by the single-letter key in effect for each; groups of one included. */
export function toolKeyGroups(tools: readonly { id: string; keys: readonly string[] }[]): ToolKeyGroup[] {
  const order = Object.keys(PHOTOSHOP_TOOL_KEYS), rank = (id: string) => { const n = order.indexOf(id); return n < 0 ? order.length : n; };
  const groups = new Map<string, string[]>();
  for (const tool of tools) {
    const key = tool.keys[0]?.toLowerCase();
    if (!cycles(key)) continue;
    groups.set(key, [...groups.get(key) ?? [], tool.id]);
  }
  return [...groups].map(([key, ids]) => ({ key, tools: ids.map((id, n) => ({ id, n })).sort((a, b) => rank(a.id) - rank(b.id) || a.n - b.n).map(t => t.id) }));
}
/** The tool a group's key picks: the current tool when it is in the group, else the one last used there, else the first. */
export function groupTool(group: ToolKeyGroup, current: string | null, last: string | undefined): string {
  return current && group.tools.includes(current) ? current : last && group.tools.includes(last) ? last : group.tools[0]!;
}
/** The tool after one in its group, wrapping round, as Shift with the key steps through Photoshop's groups. */
export function nextGroupTool(group: ToolKeyGroup, from: string): string {
  return group.tools[(group.tools.indexOf(from) + 1) % group.tools.length]!;
}

/** Keys that a part handles itself (the Select tool's Delete and Escape), declared so help lists them and hosts can rebind them. */
export interface DeclaredShortcut { id: string; label: string; group: string; keys: readonly string[]; rebindable?: boolean }

export interface EditorShortcutOptions {
  /** Keys work only while focus is inside this element. */
  scope: RefObject<HTMLElement | null>;
  /** Conflict-detection context. */
  context: string;
  /** Help-dialog heading for an action id. */
  group: (id: string) => string;
  /** The current tool, so a group's key keeps it and Shift steps on from it. */
  tool: string | null;
  /** Bindings the editor's parts handle themselves. */
  declared?: readonly DeclaredShortcut[];
  /** Per-action extra default keys beyond the definition's `shortcut`, such as a second key. */
  defaults: (id: string, shortcut: string | undefined) => readonly string[];
}

/**
 * Register an action set's shortcuts with the KeymapProvider, as `useActionShortcuts` does, with
 * Photoshop's tool groups: every tool in a group answers its letter while it is the group's current
 * tool, and Shift with the letter steps to the next one. Commands keep the ids
 * `<entity>.<action id>`, so a host's keymap and the menus find them.
 */
export function useEditorShortcuts<T>(set: ActionSet<T>, targets: readonly T[], { scope, context, group, tool, declared = [], defaults }: EditorShortcutOptions): void {
  const { start } = useActionRunner();
  const current = useRef(tool), last = useRef(new Map<string, string>()), groups = useRef<ToolKeyGroup[]>([]);
  current.current = tool;
  useEffect(() => { for (const g of groups.current) if (tool && g.tools.includes(tool)) last.current.set(g.key, tool); }, [tool]);
  const commands = useMemo(() => {
    const actions = resolveActions(set, targets, 'palette').flatMap(g => g.actions).filter(a => !a.children.length && a.commandId);
    const byTool = new Map(actions.filter(a => a.id.startsWith('tool.')).map(a => [a.id.slice(5), a]));
    const keyed = actions.map(a => ({ action: a, keys: defaults(a.id, a.definition.shortcut) }));
    groups.current = toolKeyGroups(keyed.filter(k => k.action.id.startsWith('tool.')).map(k => ({ id: k.action.id.slice(5), keys: k.keys })));
    const groupOf = new Map(groups.current.filter(g => g.tools.length > 1).flatMap(g => g.tools.map(id => [id, g] as const)));
    const list: ShortcutCommand[] = [];
    for (const { action, keys } of keyed) {
      if (!keys.length) continue;
      const declaredOnly = action.definition.shortcutScoped && !scope;
      const run = () => void start(action, targets, 'palette');
      const toolGroup = action.id.startsWith('tool.') ? groupOf.get(action.id.slice(5)) : undefined;
      const base = { id: action.commandId!, label: action.label, group: group(action.id), scope, context, textEntry: action.definition.shortcutTextEntry, disabledReason: action.disabledReason ?? null };
      if (!toolGroup) { list.push({ ...base, keys, run: declaredOnly ? undefined : run }); continue; }
      const id = action.id.slice(5);
      list.push({ ...base, keys: [...keys, `shift+${toolGroup.key}`],
        // Only the group's current tool answers its letter, so one press never picks two tools.
        when: () => groupTool(toolGroup, current.current, last.current.get(toolGroup.key)) === id,
        run: declaredOnly ? undefined : event => {
          const next = event.shiftKey ? byTool.get(nextGroupTool(toolGroup, id)) : action;
          if (next) void start(next, targets, 'palette');
        } });
    }
    for (const d of declared) list.push({ id: d.id, label: d.label, group: d.group, keys: d.keys, scope, context, rebindable: d.rebindable });
    return list;
  }, [set, targets, start, scope, context, group, declared, defaults]);
  useShortcutCommands(commands);
}
