# Image import formats

`openImage` inspects bytes rather than trusting a filename or MIME type. Original bytes stay in
`OpenedImage.originalBlob`; neither opening nor editing writes or uploads them. Advanced decoders
are separate dynamic imports. Vite hosts should set `worker: {format: "es"}` to retain code
splitting inside module workers. TIFF/PSD parsing, pixel conversion, pyramid generation and PSD asset
encoding normally run in a dedicated module worker. `OpenImageOptions.formatWorker` lets a host
supply its worker URL. A policy that prevents worker construction uses the same decoder locally.

## TIFF

TIFF uses utif2 4.1.0 (MIT). Baseline uncompressed, LZW, Deflate, PackBits and JPEG compressions are
handled by the decoder. The first page opens; `importInfo.pageCount` reports the page count. Unsigned
8-bit and 16-bit greyscale/RGB samples are accepted. The decoder reduces 16-bit samples to 8-bit RGBA
before conversion to the linear working space; import does not retain 16-bit precision. Associated
alpha is converted to straight samples at the decoder edge. All eight TIFF orientations are applied.
Embedded ICC bytes are passed to the shared colour converter. BigTIFF, separate planar channels and unusual photometric/sample
layouts are outside the supported contract. Generated fixtures cover RGB/RGBA, both byte orders,
uncompressed, LZW, Deflate, PackBits and JPEG. Broader real-camera corpus coverage remains open.

## PSD

PSD uses ag-psd 34.1.0 (MIT, with the Apache-2.0 PDF.js CMYK conversion notice retained). A headless
`openImage` source reads the saved composite. `importedLayers` exposes bottom-first image layers with
names, opacity, visibility, bounds translated into work-space quads, and the engine's 16 blend modes.
A session opens those layers above a transparent base. Their lossless unassociated-alpha TIFF assets, embedded profiles,
content-addressed ids and layer recipe survive `.guxi` saving and reopening. Loading a project uses
its saved layer list, including an empty list after deleting all layers, rather than importing again.

Text and smart objects use saved raster content; they do not become editable text or smart objects.
Groups are expanded into image layers with inherited opacity/visibility, which cannot reproduce
isolated group blending. Unsupported blend modes become normal. Layer effects, clipping groups and
PSD masks are not applied to individual layer pixels. `importInfo.warnings` records these limitations
as machine-readable codes (`psd-groups-flattened`, `psd-blend-fallback`,
`psd-layer-features-not-applied`). The saved composite remains available to headless consumers.
PSB and full Photoshop round-trip fidelity are not supported. 16-bit PSD pixels are reduced to 8-bit.

## Camera RAW previews

CR2, NEF, ARW, ORF, RAF, DNG and CR3 open **the largest complete embedded JPEG preview**, measured by
pixel area and then byte length. This is not demosaicing and does not expose sensor data, RAW white
balance or sensor dynamic range. A file with no complete JPEG preview fails explicitly. TIFF-based
camera containers are recognised by their RAW/DNG/CFA tags; RAF and CR3 have their own signatures.

The TypeScript parser steps over JPEG marker payloads, stuffed entropy bytes and restart markers;
a truncated candidate does not hide a valid smaller preview. Container orientation takes precedence
when available, otherwise preview EXIF orientation applies. The original RAW bytes remain the project
source. `importInfo.kind === 'raw-preview'` lets any host label the source. `SessionMetadataPanel`
displays the translated preview notice. Generated camera-container fixtures test routing and preview
selection; they are not a claim of coverage of every manufacturer's model or private MakerNote layout.

## HEIC / HEIF

HEIF first tries the browser's native decoder (`createImageBitmap`, then an HTML image on platforms that need it), with orientation enabled. Platform
support depends on the browser and OS. On platforms without native decoding the host may provide an
optional peer adapter, loaded only when native decoding fails:

```ts
import { openImage, type HeifDecoderModule } from 'glass-ux-image/io';

/** The host's own adapter around a HEIF decoder it chose and licensed. */
declare function loadMyHeifAdapter(): Promise<HeifDecoderModule>;

export const openPhoto = (file: Blob) => openImage(file, { loadHeif: loadMyHeifAdapter });
```

The host-installed module exports `decode(blob, {maxPixels, signal})`, returning
`{width, height, rgba, icc?, orientation?}`. `rgba` contains straight, profile-encoded 8-bit RGBA; provide
`icc` for an unconverted embedded profile. An already oriented peer omits `orientation` or uses 1.
The loader is deliberately supplied by the host: no HEVC codec or LGPL library is a dependency,
asset, CDN fetch or automatic download in this package. A missing peer rejects import.

A host choosing a libheif-based peer must review that peer and its transitive codec licences;
libheif itself is LGPL. HEVC patent rights are separate from the wrapper's copyright licence.
This project grants no HEVC patent licence. See `THIRD-PARTY-ASSETS.txt` for source references.
Native decoding gives display-converted sRGB pixels; raw ICC extraction from HEIF is not implemented.
Only Chromium's missing-native/host-adapter paths are tested here; Safari native HEIF remains untested.
