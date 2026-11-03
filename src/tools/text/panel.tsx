import { IconAlignStart, IconAlignCenter, IconAlignEnd } from "glass-ux/icons";
import { Input } from "glass-ux/input";
import { NumberField } from "glass-ux/number-field";

import { Segmented } from "glass-ux/segmented";
import { SettingRow } from "glass-ux/setting-row";
import { ColorField } from "glass-ux/color-picker";
import { PanelGroup } from "../../react/panel-layout.js";
import { useMessages } from "glass-ux/i18n";
import { layersMessages } from "../../messages/layers.js";
import type { TextColour, TextSpec } from "../../layers-text/index.js";

/** Standalone text styling, independent of editor sessions. */
export interface TextPanelProps {
  /** Complete controlled text specification. */
  value: TextSpec;
  /** Reports a complete spec and a translated history label. */
  onValueChange: (value: TextSpec, label: string) => void;
}
/** Encode straight sRGB as hex for Glass UX; no linear conversion occurs in the UI. */
export const textColourHex = (colour: TextColour) => "#" + colour.map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
/** Decode the colour picker's sRGB hex without converting working pixels. */
export function textColourFromHex(hex: string): TextColour {
  const raw = hex.slice(1);
  const expanded = raw.length <= 4 ? [...raw].map(c => c + c).join("") : raw;
  const full = expanded.length === 6 ? expanded + "ff" : expanded;
  return [0, 2, 4, 6].map(i => parseInt(full.slice(i, i + 2), 16) / 255) as unknown as TextColour;
}
/** Font controls use document pixels. A zero wrap width means no automatic wrapping. */
export function TextPanel({ value: v, onValueChange }: TextPanelProps) {
  const m = useMessages(layersMessages);
  const update = (patch: Partial<TextSpec>, label: string) => onValueChange({ ...v, ...patch }, label);
  const number = (label: string, value: number, change: (n: number) => void, min = 0, max = 10000) =>
    <SettingRow label={label} control={<NumberField size="sm" width="short" aria-label={label} value={value} min={min} max={max} step={1} onValueChange={n => n !== null && n >= min && change(n)} />} />;
  const colour = (label: string, value: TextColour, change: (c: TextColour) => void) =>
    <SettingRow label={label} control={<ColorField size="sm" aria-label={label} alpha value={textColourHex(value)} onValueChange={hex => hex && change(textColourFromHex(hex))} />} />;
  const shadow = v.shadow ?? { offsetX: 0, offsetY: 0, blur: 0, colour: [0, 0, 0, 0.5] as TextColour };
  return <div className="gi-text-panel gi-panel">
    <PanelGroup label={m.fontGroup}>
    <SettingRow label={m.font} control={<Input size="sm" aria-label={m.font} value={v.fontFamily} onValueChange={fontFamily => fontFamily && update({ fontFamily }, m.font)} />} />
    {number(m.size, v.fontSize, fontSize => update({ fontSize }, m.size), 1)}
    {number(m.weight, typeof v.fontWeight === "number" ? v.fontWeight : v.fontWeight === "bold" ? 700 : 400, fontWeight => update({ fontWeight }, m.weight), 1, 1000)}
    <SettingRow label={m.style} control={<Segmented collapse="auto" size="sm" aria-label={m.style} value={v.fontStyle} options={(["normal", "italic", "oblique"] as const).map(value => ({ value, label: m[value] }))} onValueChange={fontStyle => fontStyle && update({ fontStyle }, m.style)} />} />
    {colour(m.colour, v.colour, colour => update({ colour }, m.colour))}
    </PanelGroup>
    <PanelGroup label={m.paragraph}>
    <SettingRow label={m.alignment} control={<Segmented size="sm" aria-label={m.alignment} value={v.alignment} collapse="auto" options={[{ value: "start", icon: <IconAlignStart/>, label: m.start }, { value: "center", icon: <IconAlignCenter/>, label: m.centre }, { value: "end", icon: <IconAlignEnd/>, label: m.end }]} onValueChange={alignment => update({ alignment }, m.alignment)} />} />
    <SettingRow label={m.direction} control={<Segmented size="sm" aria-label={m.direction} value={v.direction} collapse="auto" options={[{ value: "ltr", label: m.ltr }, { value: "rtl", label: m.rtl }]} onValueChange={direction => update({ direction }, m.direction)} />} />
    {number(m.lineHeight, v.lineHeight, lineHeight => update({ lineHeight }, m.lineHeight), 1)}
    {number(m.letterSpacing, v.letterSpacing, letterSpacing => update({ letterSpacing }, m.letterSpacing), -1000)}
    {number(m.boxWidth, v.boxWidth ?? 0, boxWidth => update({ boxWidth: boxWidth || null }, m.boxWidth))}
    </PanelGroup>
    <PanelGroup label={m.outlineGroup}>
    {number(m.outline, v.outline?.width ?? 0, width => update({ outline: { width, colour: v.outline?.colour ?? [0, 0, 0, 1] } }, m.outline))}
    {colour(m.outlineColour, v.outline?.colour ?? [0, 0, 0, 1], colour => update({ outline: { width: v.outline?.width || 1, colour } }, m.outlineColour))}
    </PanelGroup>
    <PanelGroup label={m.shadowGroup}>
    {number(m.shadow, shadow.blur, blur => update({ shadow: { ...shadow, blur } }, m.shadow))}
    {colour(m.shadowColour, shadow.colour, colour => update({ shadow: { ...shadow, colour } }, m.shadowColour))}
    {number(m.shadowX, shadow.offsetX, offsetX => update({ shadow: { ...shadow, offsetX } }, m.shadowX), -10000)}
    {number(m.shadowY, shadow.offsetY, offsetY => update({ shadow: { ...shadow, offsetY } }, m.shadowY), -10000)}
    </PanelGroup>
  </div>;
}
