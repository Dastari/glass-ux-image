# CurvesEditor

An image-specific spline graph; Glass UX fields expose every point to keyboard users.

`import { CurvesEditor } from "glass-ux-image/controls/curves"`

[Live examples](https://dastari.github.io/glass-ux-image/components/curves-editor)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| aria-label | `string \| undefined` | See type | no | — | Accessible name of the curve editor. |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultValue | `readonly CurvePoint[] \| undefined` | See type | no | — | Initial uncontrolled points, defaulting to the identity. |
| disabled | `boolean \| undefined` | false, true | no | — | Disable all editing. |
| labels | `Partial<{ develop: string; basic: string; toneCurve: string; hsl: string; colourBalance: string; detail: string; levels: string; exposure: string; brightness: string; contrast: string; highlights: string; shadows: string; whites: string; blacks: string; temperature: string; tint: string; saturation: string; vibrance: string; hue: string; clarity: string; texture: string; dehaze: string; autoEnhance: string; reset: string; channel: string; rgb: string; red: string; green: string; blue: string; range: string; orange: string; yellow: string; aqua: string; purple: string; magenta: string; midtones: string; inputBlack: string; gamma: string; inputWhite: string; outputBlack: string; outputWhite: string; addPoint: string; removePoint: string; point: string; input: string; output: string; before: string; after: string; comparison: string; histogram: string; luminance: string; pixels: string; colour: string; error: string; }> \| undefined` | See type | no | — | Localised wording overrides. |
| onValueChange | `((value: readonly CurvePoint[]) => void) \| undefined` | See type | no | — | Live points during a drag, key or numeric change. |
| onValueCommitted | `((value: readonly CurvePoint[]) => void) \| undefined` | See type | no | — | Final points on release, a key step, or field blur. |
| value | `readonly CurvePoint[] \| undefined` | See type | no | — | Controlled points, strictly increasing in x, with endpoints at x=0 and x=1. |
