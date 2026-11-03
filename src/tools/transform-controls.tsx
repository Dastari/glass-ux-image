import { SettingRow } from 'glass-ux/setting-row';
import { Button } from 'glass-ux/button';
import { Field } from 'glass-ux/field';
import { NumberField } from 'glass-ux/number-field';
import { useMessages } from 'glass-ux/i18n';
import { geometryMessages } from '../messages/geometry.js';
import { useEditorContext } from '../react/session-context.js';
import { PanelActions } from '../react/panel-layout.js';
interface GeometryNumberProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    onCommit?: () => void;
    min?: number;
    max?: number;
    unit?: string;
    /** `row` puts the label beside the field; `field` puts it above, for side-by-side pairs; `bare` relies on a visible group label. */
    layout?: 'row' | 'field' | 'bare';
}
/** Internal geometry panel field. */
export function GeometryNumber({ label, value, onChange, onCommit, min = -100000, max = 100000, unit, layout = 'row' }: GeometryNumberProps) {
    const field = <NumberField aria-label={label} value={value} min={min} max={max} step={.1} size="sm" {...(layout === 'row' ? { width: 'short' as const } : { steppers: false })} {...(unit ? { unit } : {})} onBlur={onCommit} onValueChange={v => { if (v !== null && Number.isFinite(v))
        onChange(v); }}/>;
    return layout === 'bare' ? field : layout === 'field' ? <Field label={label} message="auto">{field}</Field> : <SettingRow className="gi-panel-setting" label={label} control={field}/>;
}
/** Apply or abandon a geometry draft through the session action boundary. */
export function GeometryApply({ label }: {
    label: string;
}) {
    const session = useEditorContext(), m = useMessages(geometryMessages);
    return <PanelActions><Button size="sm" variant="secondary" onClick={() => session.revert()}>{m.cancel}</Button><Button size="sm" variant="primary" onClick={() => session.commit({}, { label })}>{m.apply}</Button></PanelActions>;
}
