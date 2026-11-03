# BeforeAfter

Public comparison on Glass UX CompareSlider; image coordinates always stay left-to-right.

`import { BeforeAfter } from "glass-ux-image/editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/before-after)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| children | `ReactNode` | See type | no | — | Extra overlay content. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| maxEdge | `number \| undefined` | See type | no | 768 | Preview's longest edge; defaults to 768. |
