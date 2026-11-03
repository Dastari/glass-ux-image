# Stage 3 brief: the Lightroom-style suite

This is the working brief for Stage 3. `PROPOSAL.md` stays the design of record, and `AGENTS.md` stays
binding. Where this brief and an older build order in `PROPOSAL.md` disagree, this brief wins: the
owner reordered the work on 2026-11-02.

The target is a Lightroom feel built from our own Glass UX parts: a neutral dark stage, a histogram at
the top of a right-hand column of collapsible develop sections, a left column for presets, history and
layers, a filmstrip, before and after. It is still a component library: every tool works inside
`PhotoEditor`, and `ImageEditor` is one composition of public parts.

## Basic to advanced: kits and templates

Developers choose how much editing their users get, from a few simple photo controls up to a full suite.
Some will use one part for something unrelated to photo editing, and that must work too.

- **Every part stands alone.** Each control, panel, tool, filter and hook has a public entry and a public
  API. Nothing depends on `ImageEditor` or `PhotoEditor` being present. A `CurvesEditor` or `BlendModeSelect`
  takes plain values and callbacks and works with no session at all. Parts that need a session use the
  public hooks, so a host can do the same. Anything the demo or a template does, a host can do.
- **Kits are plain lists, in separate entries.** `glass-ux-image/kits/basic` (crop, resize, rotate,
  brightness, contrast, colour), `kits/standard` (all geometry, full tone and colour, spot healing,
  effects), `kits/advanced` (layers, text, painting, retouching, transform, liquify). A kit is an array of
  public tools that a host can spread, filter or extend, never a mode or a flag. Importing `kits/basic`
  pulls in no advanced code, and `size:check` budgets hold that for each kit.
- **Templates are copyable compositions**, on public entries only, from small to large: a single
  adjustment slider, an avatar cropper, a product photo window, a social post editor, an annotator, a
  Lightroom-style develop view, and the full suite. Each is a demo on the docs site and short enough to
  copy into a project.
- **Glass UX first.** Use its parts wherever possible: 0.14 added colour and gradient pickers among much
  else. A control here is justified only if it is image-specific.

## Docs site

A GitHub Pages site that looks and works like the Glass UX one, using its docs kit (`glass-ux-docs-kit`):
getting started, API reference generated from TSDoc, a catalogue page with a working demo for every public
part, guides for the hooks and headless layers, every template and kit as a live sample, and the full
editor as the largest demo. `llms.txt` and agent skills, as Glass UX has. All of it runs in the browser. It
is Phase 3, once the API settles.

The kit reads the source, so write for it from the start: give every exported prop and type TSDoc, and name
each public entry after its family, because the last segment of the export (`./controls/curves`) is the
family its catalogue page documents.

**Use all of Glass UX 0.14.** Before building any control, check the entries in
`node_modules/glass-ux/package.json` and the icons in `glass-ux/icons` (503 of them). That includes
`accordion`, `charts` (Histogram), `compare-slider`, `slider`, `number-field`, `percent-field`,
`segmented`, `select`, `color-picker`, `gradient-picker`, `swatch-picker`, `toolbar`, `pane-layout`,
`split-pane`, `menubar`, `command-palette`, `context-menu`, `keymap`, `actions`, `status-bar`, `tree`,
`drag-drop`, `activity-feed`, `file-dialog`, `file-provider`, `file-drop`, `file-icon`, `dialog`, `sheet`,
`popover`, `tooltip`, `kbd`, `toast`, `notice`, `progress`, `empty-state`, `tabs`, `vertical-tabs`,
`scroll-area`, `virtual-list`, `visually-hidden`, `level-gauge`, `sparkline`, `image-cropper`, `lightbox`,
`windows`. Hand-rolled controls need a reason. If a general control is missing, record it for the owner;
do not build it as an image-specific part. Icons Glass UX lacks go in `src/icons/`, drawn to
`../glass-ux/docs/icon-spec.md`.

## What the owner asked for

"Advanced" items and advanced import come later. Everything else is in scope.

### Geometry and navigation

| Tool | Function | Priority |
| --- | --- | --- |
| Crop | Freeform cropping and aspect ratios | Essential |
| Resize | Change image dimensions and resolution | Essential |
| Rotate | Rotate by arbitrary angles or 90° | Essential |
| Flip | Horizontal and vertical mirroring | Essential |
| Straighten | Correct crooked horizons | Essential |
| Move | Reposition objects and layers | Essential |
| Transform | Scale, rotate, skew and distort | Essential |
| Undo / Redo | Navigate editing history | Essential |
| Zoom / Pan | Navigate around the image | Essential |
| Canvas resize | Expand or shrink the workspace | Essential |
| Text | Text input on the image | Essential |
| Perspective correction | Correct tilted buildings and objects | Advanced, later |
| Content-aware crop | Fill empty areas after straightening | Advanced, later |

### Tone and colour

Brightness / contrast, exposure, highlights / shadows, whites / blacks, temperature / tint, saturation,
vibrance, hue, HSL mixer (individual colour ranges), levels (black, midtone and white points), curves
(precision RGB and tonal), colour balance (shadows, midtones and highlights), clarity (local midtone
contrast), texture (enhance or soften fine detail), dehaze, auto enhance.

### Painting and retouching

Brush (size, hardness, opacity), eraser (pixels or mask content), clone stamp, healing brush (repair
while blending texture), spot healing, patch tool (replace selected areas with nearby texture), blur
brush, sharpen brush, smudge, dodge, burn, sponge, colour replacement (keeps shading), red-eye removal,
liquify (warp, push, shrink or expand).

### Files

| Feature | Recommendation |
| --- | --- |
| Import | JPEG, PNG, WebP, GIF, SVG |
| Advanced import | TIFF, HEIC, AVIF, RAW, PSD (later) |
| Export | JPEG, PNG, WebP, AVIF |
| Transparency | Preserve alpha channels |
| Quality | Adjustable compression and preview |
| Metadata | View, preserve or strip EXIF |
| Colour profiles | Handle embedded ICC profiles where supported |
| Batch processing | Resize, convert or compress multiple images |
| Project files | Save an editable document including layers |
| Autosave | Restore sessions after crashes or refreshes |
| Clipboard | Paste images directly, copy final images |
| Drag and drop | Open images directly from the desktop |

### Working style

- **Keyboard shortcuts:** familiar conventions such as Ctrl+Z, Ctrl+C / Ctrl+V, B for brush, V for move,
  and Space+drag for panning.
- **Full history and recovery:** a navigable history panel, redo branching where practical, autosave,
  and restoration after crashes.
- **Responsive editing:** smooth zoom, live previews, drag handles, brush cursor feedback, and efficient
  handling of large images.
- **Local-first processing:** ordinary editing stays on the user's device, with no unnecessary uploads.
- **Customisable workspace:** collapsible panels, adjustable layout, dark mode, contextual tool settings.

### Effects

| Category | Effects |
| --- | --- |
| Blur | Gaussian, motion, radial, lens and tilt-shift |
| Sharpness | Unsharp mask, high-pass, detail enhancement |
| Artistic | Oil painting, pencil sketch, watercolour, cartoon |
| Vintage | Sepia, film grain, faded colours |
| Light | Bloom, glow, lens flare, vignette |
| Distortion | Fisheye, wave, ripple, twirl |
| Pixel effects | Pixelate, mosaic, halftone |
| Noise | Add noise, reduce noise, remove grain |
| Stylisation | Posterise, threshold, solarise, emboss |
| Colour grading | LUTs, cinematic looks, presets |

## Engine contract

Phase 0 builds this. Later phases build on it and do not redesign it.

### The pipeline

Base picture, in order:

```
decoded source → stages (retouch strokes) → quarter turn → flips → distort quad → free angle
  → work space → warps (distortion, liquify) → crop → canvas → resize → filters (develop, effects)
```

Layers then compose above the base. Each layer has its own source, its own filters, and a quad in work
space. Recipe `filters` apply to the base only. A layer is positioned in work space, so it stays over the
same part of the picture when the crop changes.

Filters run in the output's pixels, at the tile's pyramid level. Everything before them is a tile source,
evaluated on the CPU, so it is the same on both backends by construction.

### Geometry

`Geometry` gains the following. All are optional on input, and `normaliseRecipe` fills the defaults, so a
recipe from Stage 2 still loads and means the same thing.

- `angle`: degrees, -180 to 180, about the centre, after flips.
- `angleFit`: `"expand"` (bounds grow, the corners are transparent) or `"inset"` (the largest upright
  rectangle of the original aspect inside the turned picture). Straighten uses `inset`, Rotate `expand`.
- `distort`: `Quad | null`, the picture's four corners in turned pixels, for Transform on the base. It
  is also what Perspective will write later.
- `canvas`: `{ rect: Rect, fill: [r, g, b, a] | null } | null`, relative to the cropped picture. The rect
  may extend past it (expand) or sit inside it (shrink). Outside the picture is `fill` or transparent.
- `resize`: `{ width, height, dpi? } | null`, the final output size.

`geometrySize` gives the final size. With only quarter turns, flips and crop, the existing exact integer
path is kept, so existing byte-identical tests do not change. Anything else uses `warpSource`.

### `warpSource`

`warpSource(cache, mapping, size)` is a `TileSource` for any mapping from output to source position. It
reads the pyramid level that suits the local scale, resamples in linear premultiplied RGBA, and is exact
at identity. It uses bicubic at level 0 and bilinear in coarser previews. Mappings are evaluated on a
coarse grid and interpolated, so a tile costs few mapping calls. Pixels with no source are transparent.

### Warps

`defineWarp<P>({ id, map(x, y, params, size) → [sx, sy], reach? })`: an output-to-source function in
document coordinates, run by `warpSource`. Distortion effects and liquify are warps, with no GLSL, because
they cannot be bounded by filter padding and they sit before the filters anyway. A warp's parameters live
in `recipe.filters` under its id and it is registered like a filter. This is the one sanctioned exception
to "a filter has a GLSL and a TS pass". Liquify's parameters are a displacement grid as plain data.

### Filters

- `passes(params, scale, frame)`. `frame` is `{ x, y, width, height, documentWidth, documentHeight }` in
  this level's pixels, describing the source surface including padding. Anything anchored to the picture
  (vignette, tilt-shift, pixelate, halftone, grain) must use it, or tiles will show seams.
- `FilterPass.save?: string` keeps this pass's result under a name. `FilterPass.inputs?: Record<string,
  string>` binds saved results to extra samplers, so clarity and dehaze can read original and blurred.
- `FilterPass.textures?: Record<string, DataTexture>` binds data: curves, HSL tables, 3D LUTs in a 2D
  atlas. `DataTexture` is `{ width, height, data: Float32Array }` in RGBA, read with `texelFetch`.
- The CPU kernel becomes `cpu(source, target, context)`, with `context.inputs` and `context.textures`.
- A filter that needs image statistics takes them as parameters. Filters stay pure.

### Blend modes

`BlendMode` covers normal, multiply, screen, overlay, soft-light, hard-light, darken, lighten, difference,
exclusion, colour-dodge, colour-burn, hue, saturation, colour and luminosity, on both backends, in
conformance.

### Layers

`recipe.layers: LayerSpec[]` above the base, bottom first:

```ts
interface LayerSpec {
  id: string;
  name: string;
  kind: string;            // "image" built in; a tool may register others, such as "text"
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  quad: Quad;              // corners in work space; homography, so skew and distort work
  filters?: Record<string, unknown>;
  data?: unknown;          // plain data for the kind
  asset?: string;          // id in the session's asset store
}
```

`defineLayerKind({ kind, source(spec, context) → TileSource })`. A tool brings its kinds with it, so unused
kinds stay out of the bundle. The session holds an `AssetStore` (content-addressed blobs and decoded
sources). The recipe stays plain data and refers to assets by id, and `.guxi` carries them.

### Stages and strokes

`SourceStage`: `{ id, apply(base: TileSource, recipe, session) → TileSource }`, declared by a tool, run in
order on the decoded source, before geometry. Retouching is a stage, so `PhotoEditor` with only crop ships
no brush code. `recipe.strokes: Stroke[]` holds strokes as plain data, in source coordinates:
`{ id, tool, params, points, layer? }`. Replay must be deterministic, so an undo or a reopened recipe gives
the same picture. Reconciling a changed list must reuse work: undoing one stroke does not replay them all.

### Dirty tiles

`TileSource.invalidated?` (subscribe) or `document.invalidate(rect)`, reaching `TileCache` and `Renderer`:
only touched tiles recompose, at every level, including padding reach. A brush stroke must not recompose the
whole picture. `TileCache` gets an `invalidate(rect)`.

### Session

- `session.toSource(x, y)` and `session.fromSource(x, y)` map through the whole geometry, for overlays.
- `session.readPreview(maxEdge)` gives a small composed `PixelBuffer`, for the histogram, auto enhance and
  thumbnails, without blocking a frame.
- History is a tree. `commit(change, { label })` records a labelled step, `session.history` exposes nodes
  and the current one, `session.goTo(id)` moves anywhere, and undoing then editing keeps the old branch.
  Comparing recipes must not stringify every stroke: compare by reference first.
- Every new behaviour is an action, so `onAction` can see it and hosts can override it.
- Hooks stay in `src/react`: `useImageHistory` gains the tree. Add `useLayers`.
- `ImageCanvas` supports hold Space to pan and reports pointer positions in document coordinates.
- `ImageTool` gains `group` (`geometry`, `develop`, `retouch`, `effects`, `layers`, `files`) and
  `Sections?`, a list of `{ id, label, Panel }` that `ImageEditor` shows as collapsible sections.
  `PhotoEditor` shows a tool's `Panel`, or its `Sections` in an accordion.

### The shared-checkout scaffolding

Phase 1 agents share one checkout and must not touch each other's files, so Phase 0 prepares a slot for
each domain. The domains are `geometry`, `develop`, `retouch`, `effects`, `files`, `layers`, `workspace`.

- **Messages:** `src/messages/<domain>.ts`, each its own `defineMessages` namespace
  (`imageEditor.<domain>`), with `src/i18n/domains/<domain>.ts` holding all 11 translations of that domain.
  `src/react/messages.ts` keeps the base set. Pack types and `packs.test.ts` enforce every domain.
- **Styles:** `src/styles/<domain>.css`. `pnpm build` joins them after `src/styles.css`.
- **Exports:** `package.json` adds `./panels/*`, `./controls/*`, `./editor`, `./retouch`, `./codecs/*`.
- **Demo:** `apps/demo/src/domains/<domain>.ts` exports that domain's tools. The Photo editor demo page
  shows them all.
- **Tests from source:** `pnpm e2e:own <port> [spec…]` builds the demo from `src`, not `dist`, into
  `/tmp/gi-demo-<port>`, serves it on that port, and runs Playwright. It never touches `dist`, so agents
  can run browser tests at the same time.

## Phases

| Phase | Work | Runs |
| --- | --- | --- |
| 0 | Foundation: everything in the engine contract | Alone |
| 1 | `geometry`, `develop`, `retouch`, `effects`, `files`, `layers` | In parallel |
| 2 | `workspace`: `ImageEditor`, the Lightroom layout, shortcuts, kits, templates. Then a Glass UX audit and a review | One at a time |
| 3 | Docs site: `apps/docs` on the docs kit, API reference, catalogue, samples, GitHub Pages | After the API settles |

Phase 1 starts early with a headless part (1a), running beside Phase 0: kernels, maths, parsers and
solvers on plain `PixelBuffer`s, with no React and no session. The tools, panels and wiring (1b) follow once
Phase 0 reports. During 1a, Phase 0 is still changing `src/core` and `src/render`, so `Filter` and related
types may not match this brief yet. Write to this brief, and re-read `src/core/filter.ts` before finishing.

### Who owns what in Phase 1

Each agent owns its paths and nothing else. `tools/*` entries are single files or a folder with an index.

| Domain | Owns | Delivers |
| --- | --- | --- |
| `geometry` | `src/tools/{crop,crop-math,rotate,flip,straighten,resize,canvas-size,move,transform}*` | Crop presets, Resize, Rotate by degrees, Flip, Straighten with a drawn horizon line and grid, Canvas resize with an anchor picker, Move, Transform handles for scale, rotate, skew and distort |
| `develop` | `src/filters/develop/`, `src/tools/develop/`, `src/controls/{curves,levels,color-wheel}*`, `src/panels/histogram*` | Every tone and colour row, `CurvesEditor`, `LevelsEditor`, `HistogramPanel`, auto enhance, before and after |
| `retouch` | `src/retouch/`, `src/tools/retouch/`, `src/controls/brush*` | Stroke store, every painting and retouching row, brush cursor, `BrushPicker`, liquify |
| `effects` | `src/filters/effects/`, `src/tools/effects/`, `src/panels/filter-gallery*` | Every effect, `.cube` LUT import, looks and presets, a gallery with live thumbnails |
| `files` | `src/io/` (beyond what exists), `src/codecs/`, `src/tools/export*`, `src/panels/{export,metadata,batch}*` | Import, Export with live quality preview, alpha, EXIF, ICC, batch, `.guxi`, autosave adapters, clipboard, drop |
| `layers` | `src/layers-text/`, `src/tools/text*`, `src/tools/layers*`, `src/panels/layers*`, `src/controls/blend-mode*` | Text tool, image layers, `LayersPanel`, `BlendModeSelect`, reorder by keyboard |

Each domain also owns `src/messages/<domain>.ts`, `src/i18n/domains/<domain>.ts`, `src/styles/<domain>.css`,
`apps/demo/src/domains/<domain>.ts` and `e2e/<domain>.spec.ts`. `develop` and `effects` own
`apps/demo/src/conformance-<domain>.ts` and `e2e/conformance-<domain>.spec.ts`, which list their scenes. A
`package.json` export for a new entry may be added by anyone, as an additive edit. `files` owns `src/io/` and
`src/codecs/`. `@jsquash/avif` is already installed for `src/codecs/avif`. Browser test ports: geometry 4341,
develop 4342, retouch 4343, effects 4344, files 4345, layers 4346.

**Frozen in Phase 1**, because everyone depends on them: `src/core`, `src/render`, `src/session`,
`src/react`, `src/canvas`, `src/photo-editor`, `package.json`, `PROPOSAL.md`, `AGENTS.md`, this brief. A
small, purely additive change to a frozen file is allowed if you need it to finish: re-read the file
immediately before editing, keep the edit minimal, and list it in your report. A larger change: stop that
item and report it instead of redesigning.

## Rules for every agent

- Read `AGENTS.md`, `PROPOSAL.md` and this brief first, then `../glass-ux/AGENTS.md` and
  `../glass-ux/docs/ui-rules.md`.
- Do not commit, push, or start long-running servers. Phase 1 agents do not run `pnpm build`, `pnpm dev`,
  `pnpm check` or `pnpm test:e2e`, which replace `dist`. Use `pnpm exec vitest run <your paths>`,
  `pnpm exec tsc --noEmit -p tsconfig.json`, `pnpm exec oxlint --deny-warnings <your paths>` and
  `pnpm e2e:own <your port> e2e/<domain>.spec.ts`.
- Another agent's half-finished file may break a whole-project typecheck. Fix only your own errors.
- Do not install packages, except where your brief says so.
- A filter ships with both kernels and a conformance scene. Do not raise a tolerance.
- Every word goes through your domain's messages in all 11 languages. Every control has an accessible
  name and a keyboard path. Use logical CSS and Glass UX tokens. Australian spelling in code and copy. No
  promotional copy.
- Every committed change goes through a session action. Previews do not.
- Tools must be tree-shakeable: nothing in `session`, `render` or `core` may import a tool.
- Report what actually happened: what passes, what fails, what you did not build. Timings from SwiftShader
  find stalls and say nothing about GPU speed.
