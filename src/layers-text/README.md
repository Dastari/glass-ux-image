# Headless text layers

`TextSpec` is plain data in `LayerSpec.data`. Register `textLayerKind`, or call
`createTextLayerKind({ canvas, maxSources, maxCacheBytes })` to supply a canvas fake or cache limits.
There are no React, session, persistence or UI imports. Import headless APIs from `glass-ux-image/layers-text`.

Load web fonts **before** constructing a source: the host owns font assets and loading. Await
`whenFontReady(spec)` in a document or worker; it uses `document.fonts` or worker `globalThis.fonts`.
It returns false on unavailable font APIs, no matching loaded face, errors or the default 3-second
timeout. The host can then accept the declared font-family fallback. After fonts change, call
`invalidate()` on a directly created source, or recreate the layer kind to discard cached snapshots.
Font rasterisation is deterministic for the same resolved font and canvas implementation; browsers
and operating systems can rasterise the same font differently.

All dimensions are document pixels, including line height (a baseline distance), letter spacing,
outline radius, shadow offsets and blur. `boxWidth: null` disables wrapping. Explicit newlines keep
blank lines. Wrapping uses Unicode word boundaries, splitting overlong words only at grapheme
boundaries. A grapheme wider than the box overflows. Break whitespace is dropped; other whitespace
is preserved. Logical start/end honour explicit `direction`. Canvas letterSpacing is required for
nonzero spacing, preserving whole-line shaping and bidirectional ordering.

`createTextSource(spec)` measures actual glyph extents, including italic overhangs, and keeps the
logical box width for alignment. Empty lines use font metrics measured from `Mg`. Bounds add outline
and shadow support plus an antialias pixel. Shadow support is conservatively three blur radii.
The returned `bounds` records the document-space bitmap origin; the bitmap itself is normalised to
(0, 0). The layer pipeline maps **the whole bitmap** onto `LayerSpec.quad`; it does not add the bounds
offset. A host preserving the original text anchor should incorporate that origin when constructing
the initial quad.

Each requested pyramid tile is drawn directly at `2 ** -level`, retaining document-space wrapping.
There is no full-resolution bitmap allocation. Canvas sRGB straight-alpha bytes are converted once,
inside the rasteriser, through the same `pixelsFromRgba8` path used for images. Returned pixels are
linear premultiplied Float32 RGBA. Tile caches are LRU and limited to 8 MiB per source by default;
the kind keeps at most eight spec snapshots, so its retained tile buffers total at most 64 MiB.
Tile buffers are copied on return to protect cached values. Spec changes clear cached levels and
notify invalidation subscribers; source dimensions may change, so hosts must rebuild dimension-
dependent pipeline caches. Evicted sources still retained by a host retain their own bounded cache.

Unit tests use a fake `TextCanvas`. Real glyphs, shadow/outline bounds and tile seams are covered by `e2e/layers.spec.ts`.
The independent `tools/text` entry provides `TextPanel`, `TextEditor`, session wrappers and the Text
tool; `panels/layers`, `controls/blend-mode` and `tools/layers` contain no text implementation.
All session edits use intercepted actions with translated history labels. The UI message domain
contains all eleven language packs.

Merge down retains its existing behaviour: bake the selected range at the current canvas extent,
including its interactions with the lower backdrop, while keeping the base separate.

Flatten replaces the base with the full-resolution visible picture, using the same composition and
PNG encoding path as export, from the original source rather than the displayed preview. The final
export dimensions apply: crop and canvas resize intentionally choose the visible area, and resize
chooses its final pixel dimensions. Geometry (including crop, canvas and resize), base/layer filters,
strokes and visible layers are baked once; the resulting recipe has identity geometry, empty filters,
empty strokes and **no layers**. Hidden layers are discarded from the flattened state. Pixels outside
an intentional crop are excluded just as they are from a saved file; undo restores the original
source, full recipe, hidden layers and their editable data, and redo restores the flattened image.

Flatten is a labelled `layers.flatten` session action. After asynchronous rendering, its final
`edit.commit` action can also be refused by the host without changing the base or history. Concurrent
recipe/source changes abort the operation. The canonical composed export pixels are retained for byte-identical saves of the clean flattened
recipe without a second decode/quantisation cycle; every format and export transformation still
uses its ordinary encoder and options. The
flattened base is an sRGB PNG, so HDR working values become the same bytes as a normal PNG export.
The host still owns saving and persistence. Standalone panel callbacks can implement another policy.
