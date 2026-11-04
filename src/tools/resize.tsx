import { useState } from 'react';
import { IconExpand } from 'glass-ux/icons';
import { SettingRow } from 'glass-ux/setting-row';
import { Switch } from 'glass-ux/switch';
import { useMessages } from 'glass-ux/i18n';
import { Segmented } from 'glass-ux/segmented';
import { PanelGroup, PanelPair } from '../react/panel-layout.js';
import { geometrySize } from '../core/index.js';
import { geometryMessages } from '../messages/geometry.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import { GeometryApply, GeometryNumber } from './transform-controls.js';
function ResizePanel() {
    const s = useEditorContext(), { draft, sourceSize } = useSessionState(s), m = useMessages(geometryMessages), [unit, setUnit] = useState('px'), [locked, setLocked] = useState(true);
    if (!sourceSize)
        return null;
    const original = geometrySize(sourceSize, { ...draft.geometry, resize: null }), size = draft.geometry.resize ?? original;
    const set = (axis: 'width' | 'height', v: number) => {
        const value = Math.max(1, Math.round(unit === '%' ? v * original[axis] / 100 : v));
        const ratio = size.width / size.height;
        s.preview({ geometry: { ...draft.geometry, resize: { ...size, [axis]: value, ...(locked ? (axis === 'width' ? { height: Math.max(1, Math.round(value / ratio)) } : { width: Math.max(1, Math.round(value * ratio)) }) : {}) } } });
    };
    const field = (axis: 'width' | 'height') => <GeometryNumber layout="field" label={m[axis]} value={unit === '%' ? size[axis] / original[axis] * 100 : size[axis]} min={1} unit={unit} onChange={v => set(axis, v)}/>;
    return <div className="gi-panel">
      <PanelGroup label={m.size}>
        <Segmented aria-label={m.resize} size="sm" block value={unit} onValueChange={setUnit} options={[{ value: 'px', label: m.pixels }, { value: '%', label: m.percent }]}/>
        <PanelPair>{field('width')}{field('height')}</PanelPair>
        {/* R15.4: a boolean setting is a labelled Switch in a setting row, as Canvas size's Transparent is. */}
        <SettingRow className="gi-panel-setting" label={m.constrain} control={<Switch size="sm" aria-label={m.constrain} checked={locked} onCheckedChange={setLocked}/>}/>
        <GeometryNumber layout="field" label={m.dpi} value={draft.geometry.resize?.dpi ?? 72} min={1} unit="dpi" onChange={dpi => s.preview({ geometry: { ...draft.geometry, resize: { ...size, dpi } } })}/>
      </PanelGroup>
      <GeometryApply label={m.resize}/>
    </div>;
}
/** Output dimensions in pixels or percentages, with optional DPI metadata. */
export const resize = defineTool({ id: 'resize', group: 'geometry', messages: geometryMessages, label: m => m.resize, icon: <IconExpand />, Panel: ResizePanel, reset: r => ({ geometry: { ...r.geometry, resize: null } }) });
