# glass-ux-image: design proposal

`glass-ux-image` is a component library that plugs into Glass UX. It is not an application. The
full editor is one composition of its parts, and the demo site is one consumer of that composition.

Status: released as 0.1.0 on 2026-11-04, on glass-ux 0.15.0. Stages 1 to 3 are built, in `src/` and
`apps/demo/`: the engine, `PhotoEditor`, `ImageEditor`, every tool, the kits and templates, and the hooks and
parts under them. The owner reordered the later stages on 2026-11-02: `docs/stage-3-brief.md` records that
work and its engine contract, and `docs/gaps-brief.md` the work that closed the remaining gaps before 0.1.0. Mock-ups live in `mockups/` and
are built with the published `glass-ux` 0.13.0 release.

```sh
cd mockups && pnpm install --ignore-workspace && pnpm dev   # http://<host>:4320/?s=docked
```

Screens: `window`, `docked`, `focus`, `adjust`, `filters`, `export`, `open`, `pieces`, `phone-edit`,
`phone-layers`. Add `&mode=light`, `&dir=rtl&lang=ar` or `&palette=ocean` to any of them.
`node capture.mjs` writes full-resolution screenshots to `mockups/shots/` (needs the system
libraries Chromium depends on: `pnpm exec playwright install-deps chromium`).

Numbers shown in the mock-ups (timings, memory, file sizes) are illustrative, not measurements.

## Design principles

1. **The image is never judged through glass.** The stage is a neutral dark island in every mode,
   palette and direction. Default palette is Graphite, so chrome adds no colour cast.
2. **Image space never mirrors.** Canvas, rulers and coordinates stay left-to-right under RTL;
   only the chrome around them flips.
3. **Everything is non-destructive where it can be.** Adjustments and filters are layers by
   default, and any change can be compared in place.
4. **Blur stops while pixels move.** Backdrop blur over a live canvas repaints constantly. Docked
   panes never sit over the image. In Focus mode, floating panes drop blur during a stroke or pan,
   using the same "layer in motion" treatment Glass UX already gives dragged windows.
5. **The host owns the application.** The library never writes, uploads or persists anything by
   itself. Saving, actions, shortcuts and layout all pass through hooks the host controls.
6. **One action definition.** Each command is a `defineActions` entry, rendered in the menu bar,
   context menu, toolbar and command palette, so shortcuts and labels cannot drift.

## Composition model

Everything is built from four layers, and a project enters at whichever one it needs. Each layer
uses only the public API of the one below, so nothing the full editor does is out of reach for a
host.

| Layer | What it is | A project uses it to |
| --- | --- | --- |
| **Ready-made** | `ImageEditor`, `PhotoEditor` | Drop in an editor with one component |
| **Parts** | `ImageCanvas`, `LayersPanel`, `AdjustPanel`, `HistogramPanel`, `ToolRail`, `CurvesEditor`, … | Arrange its own layout |
| **Hooks** | `useImageEditor`, `useLayers`, `useImageHistory`, `useAction`, … | Build its own UI on the same state |
| **Headless** | `createImageDocument`, `defineTool`, `defineFilter` | Process images with no React, in a worker or a test |

The sizes people actually need:

```tsx
// A single photo window with basic tools. The host decides what Save means.
<PhotoEditor
  src={photo.url}
  tools={[crop, rotate, adjust, heal, text]}
  saveLabel="Save to listing"
  onSave={async (result, { signal, setProgress }) => {
    const blob = await result.toBlob({ type: "image/webp", quality: 0.82 });
    await uploadPhoto(blob, { signal, onProgress: setProgress });
  }}
/>

// The full suite, with the host's own actions added.
<ImageEditor document={doc} tools={allTools} filters={allFilters} actions={myActions} onSave={save} />

// The host's own layout around our parts.
const editor = useImageEditor({ src, tools: [crop, adjust] });

<ImageEditorProvider editor={editor}>
  <MyHeader />
  <ImageCanvas aria-label="Product photo" />
  <AdjustPanel />
  <Button onClick={() => editor.actions.run("edit.undo")}>Undo</Button>
</ImageEditorProvider>;

// No React at all.
const doc = await createImageDocument({ source: blob });
await doc.apply(gaussianBlur, { radius: 4 });
const output = await doc.export({ type: "image/png" });
```

### What the host controls

| Concern | Hook | Default |
| --- | --- | --- |
| Save and export | `onSave(result, { signal, setProgress })`, `onExport` | No Save button without a handler |
| Open | `src`, `document`, `onOpen`, or a `backend` | Nothing but what the host passes |
| Actions | `actions` adds, replaces or hides. `onAction(action, next)` can veto, wrap or redirect any of them | Built-in set for the tools in use |
| Tools and filters | Imported and passed in, plus `defineTool` and `defineFilter` for the host's own | None: unused tools stay out of the bundle |
| State | Tool, zoom, selection and panels are controlled or uncontrolled, like every Glass UX input | Uncontrolled |
| Changes | `onChange`, `onDirtyChange`, `editor.subscribe`, `doc.on` | None |
| Shortcuts | `shortcuts` overrides or turns off any binding | Scoped to the editor, not the page |
| Layout | Slots for every region, and `onWorkspaceChange` to store panel layout | Not persisted |
| Words | `labels`, plus Glass UX message packs | Glass UX packs |
| Look | Glass UX tokens, palettes and density | Host's appearance settings |
| Unsaved work | `onBeforeClose`, which plugs into the Glass UX window close guard | Asks only inside a window |

`onSave` deliberately matches `EditableAvatar` in `glass-ux/avatar`: same `signal` and
`setProgress`, same rule that the library never uploads. In a Glass UX managed window, a host turns
off `header` and `footer` and puts `PhotoEditorActions` and `PhotoEditorStatus` in the window's own
slots, so `PhotoEditor` never has to import `glass-ux/windows`.

### Package layout

One package with subpath entries, built and released as a versioned archive, like Glass UX and
`glass-ux-ide`. `glass-ux` and React are peers. A project pays only for what it imports: an entry
never pulls in the tools, filters or codecs it was not given, and `size:check` budgets hold that
for `PhotoEditor` and the full suite separately.

| Entry | Holds | React |
| --- | --- | --- |
| `/core` | Document, layer tree, tiles, selection, masks, history | No |
| `/render` | `RenderBackend`: WebGL2, WebGPU (later), CPU | No |
| `/filters/*` | One entry per filter family | No |
| `/io` | `openImage`, `encodeImage`, and later the `.guxi` format | No |
| `/session` | `EditorSession`: recipe, history, actions, saving | No |
| `/codecs/*` | Lazily loaded WASM and TypeScript codecs | No |
| `/react` | Hooks, `ImageEditorProvider`, `defineTool` | Yes |
| `/tools/*` | One entry per tool family: panel, overlay and filters | Yes |
| `/canvas` | `ImageCanvas`, the bare accelerated viewport | Yes |
| `/panels/*` | `LayersPanel`, `HistoryPanel`, `HistogramPanel`, `AdjustPanel`, … | Yes |
| `/controls/*` | `CurvesEditor`, `LevelsEditor`, `BrushPicker`, `BlendModeSelect`, … | Yes |
| `/annotator` | `ImageAnnotator` | Yes |
| `/photo-editor` | `PhotoEditor`, `PhotoEditorView`, `PhotoEditorActions`, `PhotoEditorStatus` | Yes |
| `/i18n/*` | One language pack per locale, for `registerMessagePack` | No |
| `/editor` | `ImageEditor`, the full workspace | Yes |

Hooks so far: `useImageEditor`, `useEditor`, `useSessionState`, `useTool`, `useImageHistory`, `useAction`,
`useRenderer` and `useCanvasMapping`. Planned: `useImageSelection`, `useLayers`, `useBackend` and
`useFileSystem`. Names follow `glass-ux-ide`
(`useTextDocument`, `useEditor`, `useDocumentHistory`, `useBackend`, `useFileSystem`) so the two
read as siblings. The IDE's `useCommand` and our `useAction` should settle on one name when the
shared Shortcuts work lands on `defineActions`.

### The demo

`apps/demo` lives in the repository and is left out of the package, as in Glass UX. It imports only
public entries, so anything the demo can do, a host can do. It runs entirely in the browser on
GitHub Pages and feels like a full application: files via the browser's own file APIs, autosave to
OPFS, no server. The docs site also shows `PhotoEditor` and each part on its own, so people see
the small sizes first.

### Rendering

- **WebGL2 is the primary backend.** It is the browser's OpenGL ES 3.0 and is the one accelerated
  API that can be assumed across the browsers Glass UX supports, including Firefox ESR 140.
- **WebGPU is an optional later backend**, behind the same interface.
- **The fallback is a TypeScript CPU backend** in workers with `OffscreenCanvas`, used when WebGL2
  is missing or the context is lost. The status bar shows which backend is active.
- **Each filter has one definition with a GLSL and a TypeScript kernel.** A conformance suite
  renders every filter on both backends and fails on pixel differences beyond a tolerance. This
  is the main guard against the fallback quietly rotting.
- **Large images use tiles** (256 px, with a mip pyramid), so memory and upload follow the
  viewport. Working format is linear, premultiplied RGBA16F. A device without float render targets
  (`EXT_color_buffer_float`) uses the CPU backend, because 8-bit linear bands visibly.
  Tile data lives in workers and spills to OPFS.

### Files: local and remote

This package ships no server software. Security, authentication and transport belong to the host,
and a provider arrives already able to do its job.

Most hosts need only `src` and `onSave`. A host that wants the Open screen, remote browsing or
version history supplies a backend, in the same shape as `IdeBackend` in `glass-ux-ide`: every
member is optional, and the UI offers only what is present.

```ts
interface ImageBackend {
  files?: readonly FileSystemProvider[]; // the shared Glass UX contract
  assets?: ImageAssetProvider; // brushes, LUTs, fonts, presets
  history?: ImageHistoryStore; // saved versions
}
```

```tsx
<ImageEditor backend={{ files: [localFiles(), browserFiles(), assets] }} onSave={save} />
```

`FileSystemProvider` is the shared contract in the Glass UX brief, not a type of our own. Its
ranged reads suit this package well: `.guxi` stores tiles uncompressed by the zip layer, so a large
remote document opens by reading only the tiles on screen. A version on `stat` and a conflict
result on write are what make the conflict state in the Open mock-up possible. Thumbnails are the
one addition this package asked for.

Built-in providers use the same names as the IDE (`memoryFiles`, `browserFiles`, `localFiles`,
`httpFiles`) and are all opt-in. Clipboard and drag and drop are separate, and need no provider.

`.guxi` is the native format: a zip of a JSON manifest and tile blobs.

### Accessibility and languages

- All built-in words are `defineMessages` entries with all 11 Glass UX language packs, enforced by
  the same pack coverage tests.
- Every tool is reachable by keyboard: arrow keys nudge, numeric fields replace dragging, and a
  keyboard cursor can stamp a brush. Curves, gradients and crop handles use the same pattern.
- `useAnnounce` reports tool changes and results. Focus regions (F6) move out of the canvas, so
  keyboard users are never trapped in it. Layers are a real tree with reordering by keyboard.
- Freehand painting cannot be made equivalent without a pointer. The aim is that every operation
  other than freehand drawing can be completed by keyboard, and that drawing has a usable
  keyboard path.

### Documentation and testing

Same pipeline as Glass UX: TSDoc, generated API pages, a catalogue page and working demo for each
public component, a GitHub Pages site with the full editor as its demo, `llms.txt`, agent skills
and a `check` script. Browser tests run on Chromium, Firefox and WebKit, with screenshot tests for
the stage rendering in both backends.

## What Glass UX supplies, and what it needs

In the mock-ups today: `Surface`, `Panel`, `Slider`, `NumberField`, `Select`, `Segmented`,
`ColorPicker`, `Switch`, `Badge`, `Notice`, `Field`, `FileDrop`, `Button`, icons and appearance.

Planned for the real build: `SplitPane`, `Tree`, `DragDrop`, `Dialog`, `Sheet`,
`CommandPalette`, `ContextMenu`, `windows` (floating and pop-out panels), `defineActions`,
`useHotkeys` and i18n. The dialogs, sheet, layer rows and tool rail in the mock-ups are
hand-composed stand-ins.

### Requests to Glass UX

The shared brief, `/home/toby/dev/glass-ux-ide/docs/glass-ux-request.md`, shipped in glass-ux 0.14.0 and 0.15.0.
Stage 2 needed no stopgaps. Every later stage now has what it needs: `glass-ux/menubar`,
`pane-layout`, `file-provider`, `file-dialog`, `keymap`, `status-bar`, `compare-slider`,
`gradient-picker`, the `Histogram` bins and the `ActivityFeed` timeline.

Five gaps went to the Glass UX agent on 2026-11-03 and shipped in glass-ux 0.15.0, with two docs-kit items.
The stand-ins are gone:

- **Formatters:** `numberFormat` and `formatPercent` from `glass-ux/locale` replace `src/react/format.ts`.
- **Two-way sliders** take `origin={0}`, so a -100 to 100 slider at 0 reads as unset, in both directions.
- **Colour balance** uses Glass UX's `ColorWheel`. `BalanceWheel` (`controls/balance-wheel`, formerly
  `ColorWheel` here) is now an adapter: the recipe still stores red, green and blue offsets, and
  `wheelToBalance` and `balanceToWheel` convert through OKLab, so the hue under the bead is the hue pushed.
- **F6** uses `useFocusRegionNavigation`, called from the workspace's own actions, so hosts can still veto or
  rebind it.
- **Focus** is PaneLayout's `placement: "overlay"`, derived from the workspace mode, and pointer, wheel and
  pan gestures set PaneLayout's `moving` once at the start and end.
- **Docs:** tool, filter and kit pages set `badge` in their section meta, `ReferenceSection` and its
  MutationObserver are gone, and the API pages were regenerated for left-to-right code under RTL.

Still in place:

- **RTL language:** in production builds through Tailwind v4, Glass UX's `:dir(rtl)` selectors match by
  language. A right-to-left page still needs a right-to-left `lang`: the demo switches to Arabic for
  `?dir=rtl`, and the docs preview sets `lang="ar"`. Glass UX keeps this as the documented approach.
- **Template pages:** exporting `TemplateDocumentation` and `TemplatePreview` from the kit is a recorded
  follow-up upstream. Keep the copies in `apps/docs/src/templates.tsx`.
- **Toolbar:** `Toolbar.Button` with only `disabledReason` reads as enabled, so the rail's Reset passes
  `disabled` too. Reported in the shared brief on 2026-11-03.

**Stays in `glass-ux-image`:** the engine, `ImageCanvas`, layers and masks, `CurvesEditor`,
`LevelsEditor`, `BrushPicker`, `BlendModeSelect`, the filter gallery, `ImageAnnotator`, rulers,
image-specific tool icons, `PhotoEditor` and `ImageEditor`.

## Build order

Each stage ends in something usable and published to the demo site. Parts come before the full
editor, so the full editor can only be built from public pieces. Stage 3 absorbed Stage 4's `ImageEditor`,
curves, levels, filter catalogue and export, in the order `docs/stage-3-brief.md` sets out.

1. **Engine proof.** Repository, docs site, CI. Tiled compositor on WebGL2 and CPU, conformance
   harness, one filter on both backends. Exit test: pan and zoom a 6000 × 4000 document smoothly,
   with the fallback passing conformance.
2. **`PhotoEditor`.** `ImageCanvas`, hooks, actions and `onSave`, with crop, rotate, adjust and
   export. First release projects can adopt, with the host-control API proved on a real component.
3. **Editing parts.** Layers, blend modes, history, selection, brush, transform, heal, text,
   `.guxi`, `ImageAnnotator`.
4. **`ImageEditor` and the demo.** Docked and Focus workspaces, curves, levels, masks, the filter
   catalogue, backend and file providers, Open and Export.
5. **Format and reach.** PSD, TIFF, XCF, WASM codecs, colour management, phones and tablets,
   accessibility audit, language packs.

### Stage 1 results

Measured on 2026-11-01 in headless Chromium with SwiftShader, which is WebGL2 emulated on the CPU
of a 16-core server.

| Check | Result |
| --- | --- |
| Backend conformance: 9 scenes at 3 pyramid levels | Largest difference 0.0008, against a limit of 0.002 |
| On-screen bytes at 100% | Within 2 of 255, with 0.0001% of bytes above 1 |
| Tile seams at awkward zooms | None on either backend |
| Harness sensitivity | A 4% kernel error is caught, at 2.5 times the limit |
| Pan and zoom, 6000 × 4000 | 16.7 ms frames at the 95th percentile on both backends |
| Memory at 100% | 79 tiles and 77 MB decoded |
| Loss of the GPU context | Moves to the CPU backend and keeps drawing |
| Dragging a 4–20 px blur | Not smooth: 95th percentile 150–270 ms on WebGL2, 50–150 ms on CPU |

On a real GPU, the owner reported blur dragging as very quick, and as noticeably slower but still
usable on the CPU backend (hands-on over Tailscale, 2026-11-01, no frame timings). So no cheaper
drag preview is planned.

Known gaps, for Stage 2:

- The CPU backend composes on the main thread. Tile sources already run in workers. The kernels are
  plain functions, so moving composition is contained work, and the frame budget limits the damage
  until then, though one large-radius tile can still take hundreds of milliseconds.
- Any change recomposes every tile, which is part of why blur dragging is slow. Per-tile dirty
  tracking waits for painting in Stage 3.

### Stage 2 results

Measured on 2026-11-02 against glass-ux 0.14.0, in the same headless environment as Stage 1.

| Check | Result |
| --- | --- |
| Backend conformance, now 20 scenes at 3 levels | Largest difference 0.0014, limit 0.002 |
| A full edit saved by each renderer | Byte-identical files |
| Saved files checked by pixel | Rotate, flip, crop and brightness on both renderers |
| Save after the GPU is lost | Correct, not blank: the export redoes the work on the CPU |
| Opening a 6000 × 4000 PNG | 650–980 ms, longest frame 17–33 ms, decoded in a worker |
| Accessibility (axe, outside the stage) | No violations on any tool, including contrast |
| Crop-only bundle, including React and Glass UX parts | 180 KB gzipped, with no adjust or sharpen code |
| All three tools | 193 KB gzipped |

Worked out along the way:

- **Half floats:** conformance measures a difference relative to any value above 1, because half
  floats keep relative precision. Contrast can push a pixel to about 2.4.
- **Layer order:** `styles.css` declares the layer order itself, because importing it first would
  otherwise put every Glass UX control under the reset.

Still open:

- **The CPU backend composes on the main thread.** Tile decoding is in a worker; filters are not, so a
  strong filter on a large picture can hold a frame. Hands-on it was "noticeably slower but still
  functional".
- **No editing beyond crop, rotate and adjust yet.** The `heal` and `text` tools in the mock-up belong
  to Stage 3. Straightening by a free angle is not built.
- **`PhotoEditor` has no docs site page, API reference or published release.** The docs kit is
  available but not adopted.
- **Translations are unreviewed.** All 11 packs need a native speaker's pass.
- **Only Chromium has run this.** Firefox and WebKit have not.
- **Formats:** export is limited to what the browser can encode. `/codecs` is still to come.

### Stage 3 results

Measured on 2026-11-03 against glass-ux 0.14.0, in the same headless environment as Stages 1 and 2. Parts
were built separately by agents and then run together, which is where most defects came to light.

| Check | Result |
| --- | --- |
| Unit tests | 635 |
| Browser tests on the merged code | 512, of which 511 passed; the one failure led to the alert fix below, and its three specs then passed |
| Backend conformance, all filters at 3 levels | Largest difference 0.00144, limit 0.002 |
| Saved files, both renderers | Byte-identical PNGs for geometry, layers and flatten |
| Accessibility (axe, outside the stage) | No violations on any panel or tool |
| `kits/basic` | 96 KB gzipped, with no retouch, layers, text, curves or effects modules |
| `kits/standard`, `kits/advanced` | 185 KB and 181 KB gzipped |
| `ImageEditor` with all kits | 368 KB gzipped, excluding CSS, fonts and optional WASM |
| Retouch dab, 100 px, on this server's CPU | Brush 0.5 ms, healing 2.5 ms, spot healing 3 ms |
| A stroke | Recomposes only touched tiles: 2 of 41 in the test |

Worked out along the way:

- **Full-float surfaces:** colour-dodge, colour-burn, non-separable blends, full develop and discontinuous
  effects compose in 32-bit float, because half-float rounding amplified past the conformance limit. Those
  tiles take twice the memory. The cost on large pictures has not been measured.
- **Distortion and liquify are warps,** run on the CPU before filters, so they cannot differ between renderers.
- **Hangs:** a preview spinning on disposed caches froze the page, and a failed tile read could retry forever.
  Every wait now rejects on failure and honours an abort signal.
- **Previews of other recipes** use their own branches of the stroke store, so comparing history cannot change
  the live picture.
- **Danger states already announce themselves.** `EmptyState` and `Notice` set `role="alert"`, so a wrapper must
  not add another.

Everything left open here was closed before 0.1.0; see the next section.

### Before 0.1.0: closing the gaps

Built on 2026-11-03 and 2026-11-04 against glass-ux 0.15.0 by six agents working from `docs/gaps-brief.md`,
then integrated, reviewed and tested together.

Measured on 2026-11-04 against glass-ux 0.15.0, in the same headless environment. SwiftShader timings find stalls;
they say nothing about GPU speed.

| Check | Result |
| --- | --- |
| Unit tests | 867 |
| Browser tests, Chromium and Firefox | 585: 584 passed on the final run, and the one failure was a test still looking for the old Arabic word for Crop after the translation review; it passes with the new one |
| Docs site tests | 17 of 17 |
| Independent review of the new code | 8 defects (4 in TIFF parsing and decode timeouts, the CPU worker fallback, filter identity, masks at coarse levels, profile export), all fixed with regression tests |
| Backend conformance | Unchanged limits; worker and synchronous CPU saved PNGs byte-identical |
| Eager code, gzipped (`kits/basic`, `standard`, `advanced`) | 104 KB, 193 KB, 190 KB |
| Eager code, `PhotoEditor` and `ImageEditor` with all kits | 145 KB and 373 KB |
| Lazy code, gzipped | 357 to 381 KB per entry: decoders, workers and the AVIF glue, loaded only when used |
| Release archive | 1.77 MB unpacked, 0.48 MB compressed |

- **Off the main thread:** built-in CPU tile composition (filters, blends and layers) runs in a module worker.
  Cancellation terminates stale work, frame and cache budgets still hold, and worker floats and saved PNGs
  match synchronous CPU output exactly. Custom filters can use a host-supplied worker
  (`createCpuWorkerHandler`); runtimes without workers stay synchronous.
- **The intermittent stroke stall** came from re-presenting unchanged viewport draws while tiles were pending.
  Those submissions are skipped, and both timing cases passed 26 times each with unchanged limits.
- **Layer strokes and masks:** painting and retouching work on the selected image layer, in its own pixels
  (`Stroke.layer`), through undo, saving, project files, flatten and merge down. A layer can have a mask
  (`LayerSpec.mask`, Reveal all or Hide all, on or off), painted by strokes with `mask: true`: brush reveals,
  eraser hides. Apply bakes it into the layer and Delete removes it, each one undo step through `layers.mask.*`
  actions. The Layers panel shows layer and mask thumbnails, and every painting panel has a Paint on choice.
- **Large dabs** pause every sixteen rows within the renderer's 8 ms budget, with identical results.
- **Colour:** embedded RGB matrix/TRC ICC v2 and v4 profiles (Display P3, Adobe RGB, ProPhoto, sRGB variants,
  sampled and parametric curves) convert into linear sRGB before pyramid averaging, and float tiles keep
  out-of-gamut values. Export embeds sRGB by default; source-profile export converts before byte clipping and
  embeds the source profile. Unsupported profiles fall back to sRGB with a note in the metadata panel.
- **AVIF export** writes EXIF, XMP and ICC colour information and keeps nclx coding information; the stripping
  warning is gone. The AVIF encoder stays out of any bundle that only writes PNG, JPEG or WebP.
- **Import formats:** TIFF (first page), PSD (composite and raster layers with names, opacity, visibility,
  offsets, supported blends and lossless assets, through undo and project files), camera RAW (the largest
  embedded JPEG preview, orientation kept, labelled as a preview: this is not demosaicing) and HEIF (the
  browser's decoder or a host-supplied one; no HEVC code is bundled). Each decoder is its own lazy chunk, and
  pickers use `IMAGE_IMPORT_ACCEPT`. See `docs/import-formats.md`.
- **Perspective** (`tools/perspective`, in `kits/standard`): vertical and horizontal keystone, rotate, aspect
  and scale, plus guided mode, where two to four lines drawn along edges that should be plumb or level are
  solved together. It writes `geometry.distort`; its settings are plain data in `recipe.filters.perspective`.
- **Fill edges** (`image.fillEdges`, in Rotate, Perspective, Crop and Canvas size): PatchMatch inpainting fills
  the corners left by a free angle, perspective or added canvas, in a worker, as one undo step through a source
  checkpoint, as flatten does.
- **Focus fits to the clear area:** `ImageCanvas` fits the picture to the part of the stage PaneLayout's
  `--pane-covered-*` leaves clear; zoom and pan use the whole stage.
- **Histogram RGB:** Glass UX's `Histogram` has no series, so RGB overlays three single-channel histograms on the
  stage's dark neutral.
- **File providers:** Glass UX's `testFileProvider` passes in the browser (17 of 17). The reader pins every range
  to one version and handles listings without a size or version.
- **Smaller visual gaps:** recognisable filter thumbnails (`detailScale`), templates that fill their frame
  (`createImageWorkspace({ library: 'tab' })` below 72rem), a labelled Constrain switch in Resize (R15.4),
  short public usage code on docs pages, and a Layers panel without the clipped empty state.
- **Size checks** measure eager code (what an entry loads before it runs) against the kit budgets and lazy code
  (decoders, workers) against its own budgets. Workers build as ES modules so each decoder stays its own chunk.
- **Hosted runners** ran SwiftShader 2.5 to 3 times slower than the development server, and varied run to run. The
  filter gallery's thumbnails now resample in their worker, which brought its longest frame back to the baseline's
  under a 4x CPU throttle. Frame-time limits gate on the development server and are reported, not gating, on CI
  (`expectTiming`); readiness waits get 15 s on CI. On CI every timing stayed inside its limit except the filter
  gallery's longest frame, 117 to 183 ms against 50 ms (16.8 ms here): the gallery's remaining main-thread work is
  React rendering its sections and Glass UX measuring scroll edges as thumbnails arrive.
- **Browsers:** Firefox runs the cross-browser smoke spec here on its CPU renderer. CI runs Firefox and WebKit on
  every push and before a release.
- **Translations** had a model review: 272 strings in all 11 languages corrected towards standard Photoshop and
  Lightroom terms, Glass UX's own words and each pack's register. Notes per language, including what a native
  speaker should check first (Arabic and Hebrew, which have no Adobe terminology to follow), are in
  `docs/translation-review/`. It is not a native speaker's sign-off.

Known limits, recorded rather than open:

- **Colour:** LUT-based and non-RGB ICC profiles are not converted, and browser decoding and encoding are 8-bit.
  AVIF does not carry IPTC.
- **Import:** 16-bit TIFF and PSD come in at 8 bits; BigTIFF, separate TIFF planes, CCITT, old-style JPEG, CMYK
  and non-JPEG YCbCr TIFF are rejected with a clear error; PSD groups,
  masks, effects and clipping are not fully faithful; RAW was tested on generated containers, not a camera corpus;
  native Safari HEIF is untested.
- **Layers:** text layers cannot be painted or masked, Liquify warps only the base, and Apply mask bakes to 8-bit.
  There is no mask overlay view. Coarse levels of a masked layer are built from the masked full-resolution
  pixels; a large, fully soft mask fills in over a few frames when first zoomed out, and each watched masked
  layer keeps up to 32 MiB of coarse tiles.
- **Profile export** composites in linear float before converting to the destination profile, so it holds a
  full float frame, 16 bytes a pixel, plus resize buffers.
- **Fill edges** holds the composed picture as floats on the main thread before transfer, 16 bytes a pixel, which
  limits very large pictures. Guides cannot be drawn from the keyboard; the sliders are the equivalent.
- **Focus panels float in their tracks;** they are not free windows.

## Decisions

Settled by the owner on 2026-11-01 and 2026-11-02.

- **Shape:** a component library for Glass UX. The full application is a composition and a demo.
- **Layout:** Docked is the default workspace of `ImageEditor`. Focus is a switchable mode.
- **Name:** the package is `glass-ux-image`, with entries such as `glass-ux-image/core`.
- **WASM is allowed** for optional codecs. The engine, tools and filters stay TypeScript.
- **Levels:** developers choose how much editing to offer, through `kits/basic`, `kits/standard` and
  `kits/advanced`, and copyable templates. Every part also stands alone, with its own API and hooks.
- **Feel:** Lightroom's layout and workflow, in Glass UX's own components.
- **Presets start again** (2026-11-03): choosing one runs `edit.restart`, which applies it to the picture as
  opened and drops earlier steps. Undo returns to the original. Hosts can refuse it through `onAction`.
- **Rotate is its own rail button** (2026-11-03), with a protractor dial over the picture and an angle finder:
  a line drawn along any straight edge reads its lean, and Level to line turns the picture to it. The line is
  kept in source pixels, so it stays on its feature as the picture turns.
- **Every rail has a Reset button** (2026-11-03) for the chosen tool, as one undo step. A tool declares
  `reset`; one without it resets its own `filters`. Move has nothing to reset.

### WASM codecs

Codecs sit in their own `/codecs` entry and load on first use, so the core bundle and any
application that never opens those formats pay nothing. This covers AVIF, HEIC, JPEG XL and
camera RAW, plus PNG, JPEG and WebP encoders that behave the same in every browser.

- Each codec has a TypeScript or browser fallback where one exists, and the UI shows a format as
  unavailable when neither can load, rather than failing on export.
- Strict Content Security Policies need `wasm-unsafe-eval`. The docs must say so, and a blocked
  module must take the same fallback path.
- The package is MIT. Each codec's licence and any patent exposure gets checked before it ships,
  HEIC and camera RAW first, and recorded in the third-party assets list.
