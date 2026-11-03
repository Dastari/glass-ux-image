# LevelsEditor

Keyboard-accessible input endpoints, gamma and output endpoints, using Glass UX fields.

`import { LevelsEditor } from "glass-ux-image/controls/levels"`

[Live examples](https://dastari.github.io/glass-ux-image/components/levels-editor)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| aria-label | `string \| undefined` | See type | no | — | Accessible group name; defaults to Levels. |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultValue | `Levels \| undefined` | See type | no | — | Initial uncontrolled levels; defaults to neutral. |
| disabled | `boolean \| undefined` | false, true | no | — | Disable editing. |
| labels | `Partial<{ develop: string; basic: string; toneCurve: string; hsl: string; colourBalance: string; detail: string; levels: string; exposure: string; brightness: string; contrast: string; highlights: string; shadows: string; whites: string; blacks: string; temperature: string; tint: string; saturation: string; vibrance: string; hue: string; clarity: string; texture: string; dehaze: string; autoEnhance: string; reset: string; channel: string; rgb: string; red: string; green: string; blue: string; range: string; orange: string; yellow: string; aqua: string; purple: string; magenta: string; midtones: string; inputBlack: string; gamma: string; inputWhite: string; outputBlack: string; outputWhite: string; addPoint: string; removePoint: string; point: string; input: string; output: string; before: string; after: string; comparison: string; histogram: string; luminance: string; pixels: string; colour: string; error: string; }> \| undefined` | See type | no | — | Localised wording overrides. |
| onValueChange | `((value: Levels) => void) \| undefined` | See type | no | — | Live levels, including typing, steppers and arrow keys. |
| onValueCommitted | `((value: Levels) => void) \| undefined` | See type | no | — | Final levels when focus leaves a field. |
| value | `Levels \| undefined` | See type | no | — | Controlled levels. |
