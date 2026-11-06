# HistogramPanel

Glass UX Histogram fed by readPreview, including uncommitted slider drafts. RGB is one histogram
with a series per channel, each in its own colour, screen-blended so where channels agree reads as neutral.

`import { HistogramPanel } from "glass-ux-image/panels/histogram"`

[Live examples](https://dastari.github.io/glass-ux-image/components/histogram-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| bins | `number \| undefined` | See type | no | — | Bin count. By default it follows the chart's width, about one column per 7 pixels, so columns stay legible at any size. |
| channel | `HistogramChannel \| undefined` | "rgb", "red", "green", "blue", "luminance" | no | — | Controlled histogram channel. |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultChannel | `HistogramChannel \| undefined` | "rgb", "red", "green", "blue", "luminance" | no | 'rgb' | Starting channel when uncontrolled: the red, green and blue channels overlaid by default. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| maxEdge | `number \| undefined` | See type | no | 192 | Preview maximum edge in pixels; defaults to 192. |
| onChannelChange | `((channel: HistogramChannel) => void) \| undefined` | See type | no | — | Channel selection callback. |
