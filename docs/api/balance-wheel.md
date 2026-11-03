# BalanceWheel

Push one tonal range towards a colour: the hue is the direction and the distance from the centre
is how far. The value stays the develop filter's red, green and blue offsets, so recipes are
unchanged; `wheelToBalance` and `balanceToWheel` convert between the two.

`import { BalanceWheel } from "glass-ux-image/controls/balance-wheel"`

[Live examples](https://dastari.github.io/glass-ux-image/components/balance-wheel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| aria-label | `string \| undefined` | See type | no | — | Accessible name, such as the tonal range. Defaults to "Colour balance". |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultValue | `Triple \| undefined` | See type | no | — | Initial uncontrolled offsets. |
| disabled | `boolean \| undefined` | false, true | no | — | Disables interaction while retaining the component’s disabled appearance. |
| labels | `Partial<{ develop: string; basic: string; toneCurve: string; hsl: string; colourBalance: string; detail: string; levels: string; exposure: string; brightness: string; contrast: string; highlights: string; shadows: string; whites: string; blacks: string; temperature: string; tint: string; saturation: string; vibrance: string; hue: string; clarity: string; texture: string; dehaze: string; autoEnhance: string; reset: string; channel: string; rgb: string; red: string; green: string; blue: string; range: string; orange: string; yellow: string; aqua: string; purple: string; magenta: string; midtones: string; inputBlack: string; gamma: string; inputWhite: string; outputBlack: string; outputWhite: string; addPoint: string; removePoint: string; point: string; input: string; output: string; before: string; after: string; comparison: string; histogram: string; luminance: string; pixels: string; colour: string; error: string; }> \| undefined` | See type | no | — | Localised wording overrides. |
| onValueChange | `((value: Triple) => void) \| undefined` | See type | no | — | Live offsets, while dragging too. |
| onValueCommitted | `((value: Triple) => void) \| undefined` | See type | no | — | Final offsets, once per gesture or key press. |
| size | `"sm" \| "md" \| undefined` | "sm", "md" | no | 'sm' | `sm` (default) for tool panels, or `md`. |
| value | `Triple \| undefined` | See type | no | — | Controlled red, green and blue offsets, each -100 to 100; [0,0,0] is neutral. |
| variant | `"disc" \| "ring" \| undefined` | "disc", "ring" | no | — | `disc` (default) shows the colour itself; `ring` is quieter where several wheels sit together. |
