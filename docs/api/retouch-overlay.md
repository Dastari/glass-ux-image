# RetouchOverlay

Direct DOM cursor updates; at most one recipe preview per animation frame.

`import { RetouchOverlay } from "glass-ux-image/tools/retouch"`

[Live examples](https://dastari.github.io/glass-ux-image/components/retouch-overlay)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| kind | `RetouchKind` | "brush", "eraser", "clone", "heal", "spot-heal", "patch", "blur", "sharpen", "smudge", "dodge", "burn", "sponge", "colour-replace", "red-eye", "liquify" | yes | — | Tool receiving pointer and keyboard input. |
| liquify | `LiquifyInteraction \| undefined` | See type | no | — | Displacement engine supplied by the liquify tool; pixel tools omit it. |
