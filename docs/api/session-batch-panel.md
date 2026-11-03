# SessionBatchPanel

Replay the current session recipe for independent files through an intercepted batch action.

`import { SessionBatchPanel } from "glass-ux-image/panels/batch"`

[Live examples](https://dastari.github.io/glass-ux-image/components/session-batch-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| labels | `Partial<{ size: string; export: string; metadata: string; batch: string; format: string; quality: string; width: string; height: string; alpha: string; preserve: string; strip: string; stripGps: string; preview: string; bytes: string; unavailable: string; loading: string; failed: string; open: string; projectOpen: string; projectSave: string; paste: string; copy: string; drop: string; browse: string; run: string; cancel: string; files: string; progress: string; empty: string; cameraMake: string; cameraModel: string; lens: string; exposureSeconds: string; aperture: string; iso: string; focalLengthMm: string; date: string; orientation: string; gps: string; profile: string; recover: string; autosave: string; pending: string; done: string; error: string; aborted: string; noExport: string; icc: string; iccNote: string; avifMetadata: string; project: string; recovery: string; sources: string; }> \| undefined` | See type | no | — | Host word overrides. |
| onComplete | `((results: BatchResult<Blob>[]) => unknown) \| undefined` | See type | no | — | Host result delivery; absent means results stay in memory only. |
| sessionOptions | `Omit<import("../session/session.js").EditorSessionOptions, "source" \| "recipe"> \| undefined` | See type | no | — | Rendering parts needed to replay custom filters, stages and layer kinds. |
