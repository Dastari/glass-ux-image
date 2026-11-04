import { Button } from 'glass-ux/button';
import { ColorPicker } from 'glass-ux/color-picker';
import { useMessages } from 'glass-ux/i18n';
import { NumberField } from 'glass-ux/number-field';
import { Segmented } from 'glass-ux/segmented';
import { Select } from 'glass-ux/select';
import { Slider } from 'glass-ux/slider';
import { Field } from 'glass-ux/field';
import { BrushPicker } from '../../controls/brush-picker.js';
import { PanelActions, PanelGroup, PanelHint, PanelPair } from '../../react/panel-layout.js';
import { retouchMessages } from '../../messages/retouch.js';
import { useEditorContext, useSessionState } from '../../react/session-context.js';
import { paintableLayers, readPaintTarget, readRetouchSettings, setPaintTarget, setRetouchSettings, type RetouchKind } from './settings.js';
import { applyPatch } from './patch-action.js';
/** A session-aware retouch settings panel, usable in any host layout. */
export interface RetouchPanelProps {
  /** Tool whose settings to edit. */ kind: RetouchKind }
/** Brush controls and the parameters specific to one retouch kernel. */
export function RetouchPanel({ kind }: RetouchPanelProps) {
  const session = useEditorContext(); useSessionState(session);
  const words = useMessages(retouchMessages), settings = readRetouchSettings(session, kind);
  const set = (patch: Parameters<typeof setRetouchSettings>[2]) => setRetouchSettings(session, kind, patch);
  const sourced = kind === 'clone' || kind === 'heal' || kind === 'patch';
  const selection = settings.selection;
  const rect = selection.length ? { x: selection[0]!.x, y: selection[0]!.y, width: selection[2]!.x - selection[0]!.x, height: selection[2]!.y - selection[0]!.y } : { x: 0, y: 0, width: 32, height: 32 };
  return <div className="gi-panel gi-retouch-panel">
    {kind !== 'liquify' && <PaintTargetField />}
    {kind === 'liquify' ? <label className="gi-retouch-field">{words.size}<NumberField aria-label={words.size} value={settings.size} min={1} max={500} unit="px" size="sm" onValueChange={n => n !== null && set({ size: n })} /></label> : kind === 'patch' ? null : <BrushPicker value={settings} onValueChange={set} colour={kind === 'brush' || kind === 'colour-replace'} />}
    {!['brush', 'eraser', 'clone', 'red-eye'].includes(kind) && <label className="gi-retouch-field">{words.strength}<Slider aria-label={words.strength} min={0} max={100} value={settings.strength * 100} unit="%" onValueChange={n => typeof n === 'number' && set({ strength: n / 100 })} /></label>}
    {(kind === 'dodge' || kind === 'burn') && <label className="gi-retouch-field">{words.tonalRange}<Segmented collapse="auto" size="sm" aria-label={words.tonalRange} value={settings.tonalRange} onValueChange={v => v && set({ tonalRange: v })} options={(['all', 'shadows', 'midtones', 'highlights'] as const).map(value => ({ value, label: words[value] }))} /></label>}
    {kind === 'sponge' && <Segmented collapse="auto" size="sm" block aria-label={words.mode} value={settings.desaturate ? 'desaturate' : 'saturate'} onValueChange={v => set({ desaturate: v === 'desaturate' })} options={['saturate', 'desaturate'].map(value => ({ value, label: words[value as 'saturate' | 'desaturate'] }))} />}
    {kind === 'colour-replace' && <><PanelGroup label={words.targetColour}><ColorPicker aria-label={words.targetColour} size="sm" value={settings.targetColour} onValueChange={targetColour => set({ targetColour })} eyeDropper={false} /></PanelGroup><label className="gi-retouch-field">{words.tolerance}<Slider aria-label={words.tolerance} min={1} max={173} value={settings.tolerance * 100} onValueChange={n => typeof n === 'number' && set({ tolerance: n / 100 })} /></label></>}
    {kind === 'liquify' && <Select size="sm" aria-label={words.mode} value={settings.mode} onValueChange={v => v && set({ mode: v })} options={(['push', 'twirl', 'shrink', 'expand', 'reconstruct'] as const).map(value => ({ value, label: words[value] }))} />}
    {sourced && <PanelGroup label={words.source}><PanelPair>{(['x', 'y'] as const).map(axis => <Field key={axis} label={words[axis]} message="auto"><NumberField aria-label={`${words.clone} ${words[axis]}`} value={Math.round(settings.source?.[axis] ?? 0)} min={0} max={session.state.sourceSize?.[axis === 'x' ? 'width' : 'height']} unit="px" size="sm" steppers={false} onValueChange={n => n !== null && set({ source: { ...(settings.source ?? { x: 0, y: 0 }), [axis]: n } })} /></Field>)}</PanelPair><PanelHint>{words.sourceHint}</PanelHint></PanelGroup>}
    {kind === 'patch' && <><PanelGroup label={words.area}><Button size="sm" variant="secondary" aria-pressed={Boolean(settings.selecting)} onClick={() => set({ selecting: true })}>{words.selectArea}</Button><div className="gi-retouch-rect">{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={key} label={words[key]} message="auto"><NumberField aria-label={`${words.patch} ${words[key]}`} value={Math.round(rect[key])} size="sm" unit="px" min={key === 'width' || key === 'height' ? 1 : 0} steppers={false} onValueChange={n => {
      if (n === null) return; const r = { ...rect, [key]: n };
      set({ selecting: false, selection: [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }] });
    }} /></Field>)}</div></PanelGroup><PanelActions><Button size="sm" variant="primary" disabled={!selection.length || !settings.source} onClick={() => applyPatch(session, words.patch)}>{words.applyPatch}</Button></PanelActions></>}
    <PanelHint>{words.keyboardHelp}</PanelHint>
  </div>;
}

/** Where strokes land: the picture, a layer, or a layer's mask. Shown only once there are image layers. */
function PaintTargetField() {
  const session = useEditorContext(), words = useMessages(retouchMessages);
  const layers = paintableLayers(session);
  if (!layers.length) return null;
  const target = readPaintTarget(session);
  const value = target.layer === undefined ? 'base' : `${target.mask ? 'mask' : 'layer'}:${target.layer}`;
  const options = [{ value: 'base', label: words.baseImage }, ...[...layers].reverse().flatMap(layer => [
    { value: `layer:${layer.id}`, label: layer.name },
    ...(layer.mask ? [{ value: `mask:${layer.id}`, label: words.layerMask(layer.name) }] : []),
  ])];
  return <PanelGroup label={words.paintOn}>
    <Select size="sm" aria-label={words.paintOn} value={value} options={options} onValueChange={next => {
      if (!next) return;
      const [part, ...id] = next.split(':');
      setPaintTarget(session, part === 'base' ? {} : { layer: id.join(':'), mask: part === 'mask' });
    }} />
    {target.mask && <PanelHint>{words.maskPaintHint}</PanelHint>}
  </PanelGroup>;
}
