# ExportPanel

Standalone export controls and the exact encoded preview/file size.

`import { ExportPanel } from "glass-ux-image/panels/export"`

[Live examples](https://dastari.github.io/glass-ux-image/components/export-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultValue | `EncodeOptions \| undefined` | See type | no | — | Initial settings when uncontrolled. |
| disabled | `boolean \| undefined` | false, true | no | — | Temporarily prevent edits and delivery. |
| formats | `Readonly<Record<string, boolean>> \| undefined` | See type | no | — | Actual codec availability; omit to probe native and optional encoders on mount. |
| labels | `Partial<{ size: string; export: string; metadata: string; batch: string; format: string; quality: string; width: string; height: string; alpha: string; preserve: string; strip: string; stripGps: string; preview: string; bytes: string; unavailable: string; loading: string; failed: string; open: string; projectOpen: string; projectSave: string; paste: string; copy: string; drop: string; browse: string; run: string; cancel: string; files: string; progress: string; empty: string; cameraMake: string; cameraModel: string; lens: string; exposureSeconds: string; aperture: string; iso: string; focalLengthMm: string; date: string; orientation: string; gps: string; profile: string; recover: string; autosave: string; pending: string; done: string; error: string; aborted: string; noExport: string; icc: string; iccNote: string; avifMetadata: string; project: string; recovery: string; sources: string; }> \| undefined` | See type | no | — | Translated or host-supplied words. |
| onExport | `((value: EncodeOptions) => unknown) \| undefined` | See type | no | — | The host decides what delivery means. Without this callback no Export button is shown. |
| onValueChange | `((value: EncodeOptions) => void) \| undefined` | See type | no | — | Reports a complete settings object. |
| profile | `Uint8Array<ArrayBufferLike> \| undefined` | See type | no | — | A source profile which the host permits re-embedding. No colour conversion occurs. |
| renderPreview | `((value: EncodeOptions) => Promise<Blob>) \| undefined` | See type | no | — | Inject composed pixels/encoding for a live compressed preview. |
| value | `EncodeOptions \| undefined` | See type | no | — | Controlled export settings; omit to use local state. |
