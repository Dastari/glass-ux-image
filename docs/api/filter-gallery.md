# FilterGallery

Worker-rendered thumbnails; the source reader is debounced and cancelled on replacement.

`import { FilterGallery } from "glass-ux-image/panels/filter-gallery"`

[Live examples](https://dastari.github.io/glass-ux-image/components/filter-gallery)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| aria-label | `string \| undefined` | See type | no | — | Accessible gallery name. Defaults to the effects message pack. |
| className | `string \| undefined` | See type | no | — | Layout class only. |
| defaultValue | `string \| null \| undefined` | See type | no | null | Initial selection when uncontrolled. |
| detailScale | `number \| undefined` | See type | no | 0 | The least thumbnail pixels per document pixel that effects render at. Default 0: a faithful miniature, which suits effects whose sizes scale with the picture (see `fitEffectParams`). Raise it for effects set in fixed pixels, so a 2 px line or grain still shows on a whole-picture thumbnail. |
| disabled | `boolean \| undefined` | false, true | no | false | Disable selections while the source loads. |
| documentWidth | `number \| undefined` | See type | no | — | Original document width, when the async reader chooses its own pyramid level. |
| items | `readonly FilterGalleryItem[]` | See type | yes | — | Candidates; names can come from any host message catalogue. |
| onValueChange | `((id: string) => void) \| undefined` | See type | no | — | Called when a candidate is chosen. Selection alone never commits an edit. |
| scale | `number \| undefined` | See type | no | 1 | Source pixels per document pixel, when `documentWidth` is not given. Default 1. |
| source | `PixelBuffer \| (() => Promise<PixelBuffer>) \| null` | See type | yes | — | Linear premultiplied thumbnail pixels, or an async reader such as session.readPreview. |
| value | `string \| null \| undefined` | See type | no | — | Controlled selected candidate. |
