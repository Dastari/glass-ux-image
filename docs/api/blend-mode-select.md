# BlendModeSelect

All sixteen linear-light blend modes.

`import { BlendModeSelect } from "glass-ux-image/controls/blend-mode"`

[Live examples](https://dastari.github.io/glass-ux-image/components/blend-mode-select)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| aria-label | `string \| undefined` | See type | no | — | Accessible name; defaults to the translated blend-mode label. |
| defaultValue | `"saturation" \| "hue" \| "colour" \| "normal" \| "multiply" \| "screen" \| "overlay" \| "soft-light" \| "hard-light" \| "darken" \| "lighten" \| "difference" \| "exclusion" \| "colour-dodge" \| "colour-burn" \| "luminosity" \| undefined` | "saturation", "hue", "colour", "normal", "multiply", "screen", "overlay", "soft-light", "hard-light", "darken", "lighten", "difference", "exclusion", "colour-dodge", "colour-burn", "luminosity" | no | "normal" | Initial mode when uncontrolled. |
| disabled | `boolean \| undefined` | false, true | no | — | Disables editing. |
| onValueChange | `((value: BlendMode) => void) \| undefined` | See type | no | — | Called when a mode is chosen. |
| value | `"saturation" \| "hue" \| "colour" \| "normal" \| "multiply" \| "screen" \| "overlay" \| "soft-light" \| "hard-light" \| "darken" \| "lighten" \| "difference" \| "exclusion" \| "colour-dodge" \| "colour-burn" \| "luminosity" \| undefined` | "saturation", "hue", "colour", "normal", "multiply", "screen", "overlay", "soft-light", "hard-light", "darken", "lighten", "difference", "exclusion", "colour-dodge", "colour-burn", "luminosity" | no | — | Controlled blend mode. |
