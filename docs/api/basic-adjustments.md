# BasicAdjustments

A host can render just one slider, without a provider or an editor.

`import { BasicAdjustments } from "glass-ux-image/tools/develop/basic"`

[Live examples](https://dastari.github.io/glass-ux-image/components/basic-adjustments)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| controls | `readonly (keyof AdjustParams)[] \| undefined` | See type | no | ['brightness','contrast','saturation','warmth'] | Which simple controls to expose; defaults to all four. |
| defaultValue | `AdjustParams \| undefined` | See type | no | — | Initial uncontrolled adjustments. |
| disabled | `boolean \| undefined` | false, true | no | — | Disable all sliders. |
| labels | `Partial<{ develop: string; basic: string; toneCurve: string; hsl: string; colourBalance: string; detail: string; levels: string; exposure: string; brightness: string; contrast: string; highlights: string; shadows: string; whites: string; blacks: string; temperature: string; tint: string; saturation: string; vibrance: string; hue: string; clarity: string; texture: string; dehaze: string; autoEnhance: string; reset: string; channel: string; rgb: string; red: string; green: string; blue: string; range: string; orange: string; yellow: string; aqua: string; purple: string; magenta: string; midtones: string; inputBlack: string; gamma: string; inputWhite: string; outputBlack: string; outputWhite: string; addPoint: string; removePoint: string; point: string; input: string; output: string; before: string; after: string; comparison: string; histogram: string; luminance: string; pixels: string; colour: string; error: string; }> \| undefined` | See type | no | — | Localised wording overrides. |
| onValueChange | `((value: AdjustParams) => void) \| undefined` | See type | no | — | Live values. |
| onValueCommitted | `((value: AdjustParams) => void) \| undefined` | See type | no | — | Values on pointer release or a keyboard step. |
| value | `AdjustParams \| undefined` | See type | no | — | Controlled brightness, contrast, saturation and warmth values (-100…100). |
