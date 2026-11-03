# FilesPanel

Session-bound open, clipboard, native project and recovery actions supplied by host file adapters.

`import { FilesPanel } from "glass-ux-image/tools/export"`

[Live examples](https://dastari.github.io/glass-ux-image/components/files-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| autosaveId | `string \| undefined` | See type | no | 'document' | Host-owned recovery key within its adapter. |
| autosaveStore | `AutosaveStore \| undefined` | See type | no | — | Optional autosave adapter. Absent means no autosave or recovery access. |
| clipboard | `ImageClipboard \| undefined` | See type | no | — | Opt-in clipboard, usually constructed in the browser by the host. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| labels | `Partial<{ size: string; export: string; metadata: string; batch: string; format: string; quality: string; width: string; height: string; alpha: string; preserve: string; strip: string; stripGps: string; preview: string; bytes: string; unavailable: string; loading: string; failed: string; open: string; projectOpen: string; projectSave: string; paste: string; copy: string; drop: string; browse: string; run: string; cancel: string; files: string; progress: string; empty: string; cameraMake: string; cameraModel: string; lens: string; exposureSeconds: string; aperture: string; iso: string; focalLengthMm: string; date: string; orientation: string; gps: string; profile: string; recover: string; autosave: string; pending: string; done: string; error: string; aborted: string; noExport: string; icc: string; iccNote: string; avifMetadata: string; project: string; recovery: string; sources: string; }> \| undefined` | See type | no | — | Host word overrides. |
| onProjectSave | `((blob: Blob) => unknown) \| undefined` | See type | no | — | Receives a project blob. The host decides how and whether to store it. |
| providers | `readonly FileProvider[] \| undefined` | See type | no | [] | Glass UX storage providers, already authenticated by the host. |
