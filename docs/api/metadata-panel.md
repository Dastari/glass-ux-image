# MetadataPanel

Read-only metadata and profile descriptions from plain host values, without a session.

`import { MetadataPanel } from "glass-ux-image/panels/metadata"`

[Live examples](https://dastari.github.io/glass-ux-image/components/metadata-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| className | `string \| undefined` | See type | no | — | Layout class. |
| importInfo | `{ kind: string; } \| undefined` | See type | no | — | Import provenance, including preview-only RAW sources. |
| labels | `Partial<{ size: string; export: string; metadata: string; batch: string; format: string; quality: string; width: string; height: string; alpha: string; preserve: string; strip: string; stripGps: string; preview: string; bytes: string; unavailable: string; loading: string; failed: string; open: string; projectOpen: string; projectSave: string; paste: string; copy: string; drop: string; browse: string; run: string; cancel: string; files: string; progress: string; empty: string; cameraMake: string; cameraModel: string; lens: string; exposureSeconds: string; aperture: string; iso: string; focalLengthMm: string; date: string; orientation: string; gps: string; profile: string; recover: string; autosave: string; pending: string; done: string; error: string; aborted: string; noExport: string; icc: string; iccNote: string; profileFallback: string; rawPreview: string; project: string; recovery: string; sources: string; }> \| undefined` | See type | no | — | Host word overrides. |
| profile | `IccProfile \| null \| undefined` | See type | no | — | Optional extracted ICC description. |
| value | `ImageMetadata \| null` | See type | yes | — | Parsed source metadata, or null when absent. |
