# FilterGalleryPanel

Session-bound effect candidates with worker-rendered thumbnails; selection commits an intercepted action.

`import { FilterGalleryPanel } from "glass-ux-image/tools/effects"`

[Live examples](https://dastari.github.io/glass-ux-image/components/filter-gallery-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| category | `EffectCategory \| undefined` | "blur", "sharpness", "artistic", "vintage", "light", "distortion", "pixel", "noise", "stylisation", "grading" | no | — | Category to browse; omitted shows every filter. |
| presets | `boolean \| undefined` | false, true | no | false | Show look/preset recipes instead of individual filters. |
| session | `EditorSession \| undefined` | See type | no | — | Session to edit; defaults to the nearest ImageEditorProvider. |
