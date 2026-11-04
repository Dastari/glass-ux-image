# BrushPicker

Size, hardness, opacity, flow and optional colour, using Glass UX controls.

`import { BrushPicker } from "glass-ux-image/controls/brush-picker"`

[Live examples](https://dastari.github.io/glass-ux-image/components/brush-picker)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| className | `string \| undefined` | See type | no | — | Layout class. |
| colour | `boolean \| undefined` | false, true | no | true | Show the colour picker and its preset swatches; default true. |
| defaultValue | `BrushValues \| undefined` | See type | no | defaultBrush | Initial settings when uncontrolled. |
| disabled | `boolean \| undefined` | false, true | no | — | Disable every control. |
| labels | `Partial<{ source: string; area: string; previewFailed: string; brush: string; eraser: string; clone: string; heal: string; "spot-heal": string; patch: string; blur: string; sharpen: string; smudge: string; dodge: string; burn: string; sponge: string; "colour-replace": string; "red-eye": string; liquify: string; size: string; hardness: string; opacity: string; flow: string; colour: string; strength: string; tonalRange: string; all: string; shadows: string; midtones: string; highlights: string; mode: string; push: string; twirl: string; shrink: string; expand: string; reconstruct: string; sourceHint: string; keyboardHelp: string; cursor: string; selectArea: string; applyPatch: string; x: string; y: string; width: string; height: string; targetColour: string; tolerance: string; saturate: string; desaturate: string; paintOn: string; baseImage: string; maskPaintHint: string; layerMask: (name: string) => string; }> \| undefined` | See type | no | — | Override domain words. |
| onValueChange | `((value: BrushValues) => void) \| undefined` | See type | no | — | Called for each settings change; never commits an image edit. |
| swatches | `ColorSwatch[] \| undefined` | See type | no | ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'] | Host-supplied named swatches, in display sRGB hex. |
| value | `BrushValues \| undefined` | See type | no | — | Controlled settings. Pair with onValueChange. |
