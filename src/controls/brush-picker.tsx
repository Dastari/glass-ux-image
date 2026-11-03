/* tokens:allow-file Brush presets are sRGB paint data, independent of theme. */
import { PercentInput } from 'glass-ux/percent-field';
import { useState } from 'react';
import { ColorPicker, type ColorSwatch } from 'glass-ux/color-picker';
import { useMessages } from 'glass-ux/i18n';
import { NumberField } from 'glass-ux/number-field';
import { Slider } from 'glass-ux/slider';
import { retouchMessages, type RetouchMessages } from '../messages/retouch.js';

/** Plain brush settings; colour is display sRGB hex, converted at the pixel API edge. */
export interface BrushValues {
  /** Source-pixel diameter. */ size: number;
  /** Fraction of the radius with full coverage, 0–1. */ hardness: number;
  /** Per-dab opacity, 0–1. */ opacity: number;
  /** Per-dab flow, 0–1. */ flow: number;
  /** Straight sRGB hex colour. */ colour: string;
}
/** Initial settings, also useful to hosts controlling BrushPicker. */
export const defaultBrush: BrushValues = { size: 32, hardness: .75, opacity: 1, flow: 1, colour: '#000000' };
/** A standalone picker with no session dependency. */
export interface BrushPickerProps {
  /** Controlled settings. Pair with onValueChange. */ value?: BrushValues;
  /** Initial settings when uncontrolled. */ defaultValue?: BrushValues;
  /** Called for each settings change; never commits an image edit. */ onValueChange?: (value: BrushValues) => void;
  /** Show the colour picker and its preset swatches; default true. */ colour?: boolean;
  /** Host-supplied named swatches, in display sRGB hex. */ swatches?: ColorSwatch[];
  /** Disable every control. */ disabled?: boolean;
  /** Override domain words. */ labels?: Partial<RetouchMessages>;
  /** Layout class. */ className?: string;
}
/** Size, hardness, opacity, flow and optional colour, using Glass UX controls. */
export function BrushPicker({ value, defaultValue = defaultBrush, onValueChange, colour = true, swatches = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'], disabled, labels, className }: BrushPickerProps) {
  const [local, setLocal] = useState(defaultValue), current = value ?? local;
  const words = useMessages(retouchMessages, labels ? { labels } : {});
  const change = (patch: Partial<BrushValues>) => { const next = { ...current, ...patch }; if (value === undefined) setLocal(next); onValueChange?.(next); };
  return <div className={['gi-brush-picker', className].filter(Boolean).join(' ')}>
    {(['size', 'hardness', 'opacity', 'flow'] as const).map(key => {
      const multiplier = key === 'size' ? 1 : 100, min = key === 'size' ? 1 : 0, max = key === 'size' ? 500 : 100;
      return <div className="gi-brush-setting" key={key}>
        <span>{words[key]}</span>
        {key === 'size' ? <NumberField aria-label={words[key]} size="sm" steppers={false} min={1} max={500} value={current.size} unit="px" disabled={disabled} onValueChange={n => n !== null && change({ size: n })} /> : <PercentInput scale="fraction" aria-label={words[key]} size="sm" steppers={false} value={current[key]} disabled={disabled} onValueChange={n => n !== null && change({ [key]: n })} />}
        <Slider aria-label={words[key]} size="sm" min={min} max={max} value={current[key] * multiplier} unit={key === 'size' ? 'px' : '%'} disabled={disabled} onValueChange={n => typeof n === 'number' && change({ [key]: n / multiplier })} />
      </div>;
    })}
    {colour && <ColorPicker aria-label={words.colour} size="sm" value={current.colour} onValueChange={colour => change({ colour })} swatches={swatches} disabled={disabled} eyeDropper={false} />}
  </div>;
}
