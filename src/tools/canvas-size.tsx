import { SettingRow } from 'glass-ux/setting-row';
import { useState } from 'react';
import { useControllable } from 'glass-ux/hooks';
import { Button } from 'glass-ux/button';
import { ColorPicker } from 'glass-ux/color-picker';
import { IconArrowDown, IconArrowDownLeft, IconArrowDownRight, IconArrowLeft, IconArrowRight, IconArrowUp, IconArrowUpLeft, IconArrowUpRight, IconExpand, IconLocate } from 'glass-ux/icons';
import { PanelGroup, PanelPair } from '../react/panel-layout.js';
import { useMessages } from 'glass-ux/i18n';
import { Switch } from 'glass-ux/switch';
import { workSize } from '../core/index.js';
import { geometryMessages } from '../messages/geometry.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import { GeometryApply, GeometryNumber } from './transform-controls.js';
import { anchoredCanvas, canvasFill, type CanvasAnchor } from './transform-math.js';
export { anchoredCanvas, canvasFill, type CanvasAnchor } from './transform-math.js';
/** Image-space anchor selection; works without an editor or session. */
export interface AnchorPickerProps {
    /** Selected cell in image space; pair with onValueChange to control it. */
    value?: CanvasAnchor;
    /** Starting cell when uncontrolled. Defaults to the centre. */
    defaultValue?: CanvasAnchor;
    /** Receives a selected cell, from top left (0) through bottom right (8). */
    onValueChange?: (value: CanvasAnchor) => void;
}
const ANCHOR_ICONS=[<IconArrowUpLeft/>,<IconArrowUp/>,<IconArrowUpRight/>,<IconArrowLeft/>,<IconLocate/>,<IconArrowRight/>,<IconArrowDownLeft/>,<IconArrowDown/>,<IconArrowDownRight/>];
/** Nine-position image-space anchor picker, with roving arrow-key focus. */
export function AnchorPicker({ value, defaultValue=4, onValueChange }: AnchorPickerProps) {
    const [current,choose]=useControllable(value,defaultValue,onValueChange);
    const m=useMessages(geometryMessages);
    const names=[m.topLeft,m.top,m.topRight,m.left,m.centre,m.right,m.bottomLeft,m.bottom,m.bottomRight];
    return <div role="radiogroup" aria-label={m.anchor} className="gi-anchor" dir="ltr">
        {names.map((name,i)=><Button key={i} size="sm" variant={current===i?'soft':'ghost'} icon={ANCHOR_ICONS[i]} aria-label={name} role="radio" aria-checked={current===i} tabIndex={current===i?0:-1}
            onClick={()=>choose(i as CanvasAnchor)} onKeyDown={event=>{
                const step=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-3,ArrowDown:3} as Record<string,number>)[event.key];
                if(!step)return;
                event.preventDefault();
                const next=Math.max(0,Math.min(8,i+step)) as CanvasAnchor;
                choose(next);
                (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }}/>)}
    </div>;
}
function CanvasSizePanel() {
    const s = useEditorContext(), { draft, sourceSize } = useSessionState(s), m = useMessages(geometryMessages), [anchor, setAnchor] = useState<CanvasAnchor>(4), [colour, setColour] = useState('#ffffffff');
    if (!sourceSize)
        return null;
    const base = draft.geometry.crop ?? workSize(sourceSize, draft.geometry), current = draft.geometry.canvas, size = current?.rect ?? base;
    const change = (next: {
        width: number;
        height: number;
    }, at = anchor, fill = current?.fill ?? null) => s.preview({ geometry: { ...draft.geometry, canvas: { rect: anchoredCanvas(base, next, at), fill } } });
    const field = (axis: 'width' | 'height') => <GeometryNumber layout="field" label={m[axis]} value={size[axis]} min={1} unit="px" onChange={v => change({ ...size, [axis]: Math.round(v) })}/>;
    return <div className="gi-panel">
      <PanelGroup label={m.size}><PanelPair>{field('width')}{field('height')}</PanelPair></PanelGroup>
      <PanelGroup label={m.anchor}><AnchorPicker value={anchor} onValueChange={v => { setAnchor(v); change(size, v); }}/></PanelGroup>
      <PanelGroup label={m.fill}>
        <SettingRow className="gi-panel-setting" label={m.transparent} control={<Switch size="sm" aria-label={m.transparent} checked={!current?.fill} onCheckedChange={v => change(size, anchor, v ? null : canvasFill(colour))}/>}/>
        {current?.fill && <ColorPicker aria-label={m.fill} size="sm" alpha value={colour} onValueChange={v => { setColour(v); change(size, anchor, canvasFill(v)); }}/>}
      </PanelGroup>
      <GeometryApply label={m.canvasSize}/>
    </div>;
}
/** Expand or shrink the canvas around a chosen anchor, with transparent or coloured fill. */
export const canvasSize = defineTool({ id: 'canvas-size', group: 'geometry', messages: geometryMessages, label: m => m.canvasSize, icon: <IconExpand />, Panel: CanvasSizePanel, reset: r => ({ geometry: { ...r.geometry, canvas: null } }) });
