# BatchPanel

Choose local files and run an injected renderer with per-file results. The host owns delivery.

`import { BatchPanel } from "glass-ux-image/panels/batch"`

[Live examples](https://dastari.github.io/glass-ux-image/components/batch-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| concurrency | `number \| undefined` | See type | no | 2 | Maximum concurrent files; default two. |
| defaultSources | `readonly File[] \| undefined` | See type | no | [] | Initial list in uncontrolled use. |
| labels | `Partial<{ size: string; export: string; metadata: string; batch: string; format: string; quality: string; width: string; height: string; alpha: string; preserve: string; strip: string; stripGps: string; preview: string; bytes: string; unavailable: string; loading: string; failed: string; open: string; projectOpen: string; projectSave: string; paste: string; copy: string; drop: string; browse: string; run: string; cancel: string; files: string; progress: string; empty: string; cameraMake: string; cameraModel: string; lens: string; exposureSeconds: string; aperture: string; iso: string; focalLengthMm: string; date: string; orientation: string; gps: string; profile: string; recover: string; autosave: string; pending: string; done: string; error: string; aborted: string; noExport: string; icc: string; iccNote: string; profileFallback: string; rawPreview: string; project: string; recovery: string; sources: string; }> \| undefined` | See type | no | — | Host word overrides. |
| onComplete | `((results: BatchResult<Blob>[]) => unknown) \| undefined` | See type | no | — | Receives every result. The host chooses whether to save successful files. |
| onSettingsChange | `((settings: BatchSettings<EditRecipe>) => void) \| undefined` | See type | no | — | Report edited format, quality and dimensions. |
| onSourcesChange | `((sources: readonly File[]) => void) \| undefined` | See type | no | — | Reports the next input list. |
| renderOne | `(source: Blob, settings: BatchSettings<EditRecipe>, context: { signal?: AbortSignal; index: number; }) => Promise<Blob>` | See type | yes | — | Render one image without relying on any editor context. |
| runBatch | `((sources: readonly Blob[], options: import("../io/batch/index.js").BatchOptions<Blob, Blob, EditRecipe>) => Promise<BatchResult<Blob>[]>) \| undefined` | See type | no | — | Optional intercepted run supplied by a session binding. |
| settings | `BatchSettings<EditRecipe> \| undefined` | See type | no | — | Plain output/recipe settings. |
| sources | `readonly File[] \| undefined` | See type | no | — | Controlled input list. |
