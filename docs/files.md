# Files and persistence

openImage accepts JPEG, PNG, WebP, GIF and sanitised SVG. GIF opens its first frame. Optional AVIF export uses the codec entry; AVIF import is not supported. Export availability is probed: do not promise a format from its extension alone. Unsupported advanced import formats fail explicitly. The current API does not imply PSD, RAW, HEIC, TIFF or XCF editing.

## Open a bounded source

```ts
import { openImage } from 'glass-ux-image/io';
export async function thumbnail(blob:Blob) {
  const source=await openImage(blob,{maxPixels:16_000_000});
  try { return await source.readTile({level:0,x:0,y:0}); }
  finally { source.dispose?.(); }
}
```

Keep the original encoded Blob when preserving metadata or writing a project. JPEG, PNG and WebP expose EXIF, XMP and IPTC packets. Export can preserve, strip all metadata, or strip standard GPS fields. Stripping GPS is not a guarantee of anonymisation: inspect other text and image content. ICC descriptions can be read and profiles re-embedded where supported; this is not a general colour-management conversion. AVIF export strips metadata/profile payloads.

.guxi stores a versioned manifest, original source and asset blobs. encodeProject/decodeProject are asynchronous; attachSessionFiles adds intercepted project/open/recovery actions with host callbacks. Do not write archive parsing or transport in a component. Project payloads remain untrusted input.

Autosave is an explicit host adapter, never implicit library storage. Choose OPFS or IndexedDB, call autosaveSession, listRecovery on startup and dispose the adapter subscription on close. Namespace stores per application and user. Recovery candidates can fail; preserve the original record until the user has recovered or discarded it.

BatchPanel injects renderOne; runBatch has bounded concurrency and per-file results. SessionBatchPanel replays the current recipe using the rendering parts the host supplies. The host decides whether each resulting Blob is downloaded or uploaded. Clipboard reads and file drop likewise need host permissions and handlers.

SVG is sanitised before rasterising: scripts, external references and unsupported markup are rejected. Never insert untrusted SVG into the host DOM. Enforce file and decoded-pixel limits before allocation, handle abort/error paths, and treat filenames and metadata as text. Do not relax CSP for source content. Optional WASM codecs require `wasm-unsafe-eval` in script-src; workers need an appropriate worker-src and emitted worker URLs. A blocked codec follows its supported fallback or reports unavailable. Host authentication, CORS and transport are outside the library. See THIRD-PARTY-ASSETS.txt in the repository for codec licences.
