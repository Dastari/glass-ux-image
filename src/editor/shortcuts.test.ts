import { describe, expect, it } from 'vitest';
import { canonicalShortcut } from 'glass-ux/kbd';
import { PHOTOSHOP_COMMAND_KEYS, PHOTOSHOP_TOOL_KEYS, groupTool, keysFor, nextGroupTool, toolKeyGroups, toolKeys } from './shortcuts.js';

describe('Photoshop shortcut table', () => {
  it("uses Photoshop's tool letters", () => {
    expect(toolKeys('select')).toEqual(['v']);
    expect(toolKeys('crop')).toEqual(['c']);
    expect(toolKeys('retouch.brush')).toEqual(['b']);
    expect(toolKeys('retouch.eraser')).toEqual(['e']);
    expect(toolKeys('retouch.clone')).toEqual(['s']);
    expect(toolKeys('retouch.heal')).toEqual(['j']);
    expect(toolKeys('retouch.burn')).toEqual(['o']);
    expect(toolKeys('text')).toEqual(['t']);
    expect(toolKeys('transform')).toEqual(['mod+t']);
    expect(toolKeys('custom', 'k')).toEqual(['k']);
    expect(toolKeys('custom')).toEqual([]);
  });
  it("uses Photoshop's command keys", () => {
    expect(PHOTOSHOP_COMMAND_KEYS['edit.undo']).toEqual(['mod+z']);
    expect(PHOTOSHOP_COMMAND_KEYS['edit.redo']).toEqual(['mod+shift+z']);
    expect(PHOTOSHOP_COMMAND_KEYS['view.fit']).toEqual(['mod+0']);
    expect(PHOTOSHOP_COMMAND_KEYS['view.actualSize']).toEqual(['mod+1']);
    expect(PHOTOSHOP_COMMAND_KEYS['layers.duplicate']).toEqual(['mod+j']);
    expect(PHOTOSHOP_COMMAND_KEYS['layers.mergeDown']).toEqual(['mod+e']);
    expect(PHOTOSHOP_COMMAND_KEYS['layers.mergeVisible']).toEqual(['mod+shift+e']);
    expect(PHOTOSHOP_COMMAND_KEYS['brush.smaller']).toEqual(['[']);
    expect(PHOTOSHOP_COMMAND_KEYS['brush.larger']).toEqual([']']);
  });
  it('writes every key so the dispatcher can read it', () => {
    for (const keys of [...Object.values(PHOTOSHOP_COMMAND_KEYS).flat(), ...Object.values(PHOTOSHOP_TOOL_KEYS)])
      expect(canonicalShortcut(keys, 'other'), keys).not.toMatch(/\+$/);
  });
  it('lets a host replace or turn off any binding', () => {
    expect(keysFor('edit.undo', ['mod+z'], { 'edit.undo': 'alt+z' })).toEqual(['alt+z']);
    expect(keysFor('edit.undo', ['mod+z'], { 'edit.undo': null })).toEqual([]);
    expect(keysFor('edit.undo', ['mod+z'], { 'edit.undo': ['a', 'b'] })).toEqual(['a', 'b']);
    expect(keysFor('edit.undo', ['mod+z'], {})).toEqual(['mod+z']);
  });
});

describe('tool groups', () => {
  const tools = ['retouch.patch', 'retouch.heal', 'retouch.spot-heal', 'crop', 'transform', 'retouch.red-eye', 'custom'].map(id => ({ id, keys: id === 'custom' ? ['J'] : toolKeys(id) }));
  const groups = toolKeyGroups(tools), j = groups.find(g => g.key === 'j')!;
  it("orders a shared letter's tools as Photoshop does, then the host's own", () => {
    expect(j.tools).toEqual(['retouch.spot-heal', 'retouch.heal', 'retouch.patch', 'retouch.red-eye', 'custom']);
    expect(groups.find(g => g.key === 'c')!.tools).toEqual(['crop']);
    // Keys with modifiers never cycle.
    expect(groups.some(g => g.tools.includes('transform'))).toBe(false);
  });
  it('keeps the current tool, else the last one used, else the first', () => {
    expect(groupTool(j, 'retouch.patch', 'retouch.heal')).toBe('retouch.patch');
    expect(groupTool(j, 'crop', 'retouch.heal')).toBe('retouch.heal');
    expect(groupTool(j, null, undefined)).toBe('retouch.spot-heal');
  });
  it('steps to the next tool with Shift, wrapping round', () => {
    expect(nextGroupTool(j, 'retouch.spot-heal')).toBe('retouch.heal');
    expect(nextGroupTool(j, 'custom')).toBe('retouch.spot-heal');
  });
});
