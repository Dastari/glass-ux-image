# SessionExportPanel

Session export controls with a compressed preview and host-controlled delivery.

`import { SessionExportPanel } from "glass-ux-image/panels/export"`

[Live examples](https://dastari.github.io/glass-ux-image/components/session-export-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| defaultValue | `EncodeOptions \| undefined` | See type | no | — | Initial output settings. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest ImageEditorProvider. |
| labels | `Partial<{ size: string; export: string; metadata: string; batch: string; format: string; quality: string; width: string; height: string; alpha: string; preserve: string; strip: string; stripGps: string; preview: string; bytes: string; unavailable: string; loading: string; failed: string; open: string; projectOpen: string; projectSave: string; paste: string; copy: string; drop: string; browse: string; run: string; cancel: string; files: string; progress: string; empty: string; cameraMake: string; cameraModel: string; lens: string; exposureSeconds: string; aperture: string; iso: string; focalLengthMm: string; date: string; orientation: string; gps: string; profile: string; recover: string; autosave: string; pending: string; done: string; error: string; aborted: string; noExport: string; icc: string; iccNote: string; profileFallback: string; rawPreview: string; project: string; recovery: string; sources: string; }> \| undefined` | See type | no | — | Host word overrides. |
