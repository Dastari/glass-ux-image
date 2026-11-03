# Headless develop

Import `develop`, `NEUTRAL`, `computeHistogram` and `autoEnhance` from this directory's
`index.ts`. Export/package wiring belongs to the integration step. `adjust.ts` is unchanged.
All parameters are plain serialisable data. Top-level omissions use `NEUTRAL`; when supplying
`levels`, `curves`, `hsl` or `colourBalance`, supply the complete nested object (spread the
neutral object first). Inputs and parameters are never mutated. `NEUTRAL` emits no passes.

The input and output are linear premultiplied RGBA. Each non-spatial operation divides by
positive alpha, changes straight colour, then premultiplies by the original alpha. Zero alpha
produces transparent black. There is no epsilon division that distorts nearly transparent
colour. Input pixels must be finite. The statistics helpers additionally ignore non-finite
pixels. Alpha is never sharpened or graded.

## Order and spaces

1. Exposure is a linear gain of `2 ** stops`. Temperature and tint are linear channel gains.
   Temperature maps relative -100…100 warmth to `6500 * 2 ** (temperature/100)` kelvin.
   `kelvinTintToGains` is a neutral-relative photographic approximation, not camera RAW
   calibration or an ICC chromatic adaptation. Positive temperature warms, positive tint
   adds magenta. `autoEnhance` returns these relative parameters, not absolute kelvin.
2. Extended sRGB transfer encodes straight linear RGB into a perceptual working space.
   It extends above 1 without clipping. This is internal tone maths, not an IO conversion.
3. Contrast expands about encoded 18% grey by `2 ** (contrast/100)`. Brightness adds at most
   ±0.25 perceptual units. Highlights and shadows add at most ±0.25, weighted by smoothstep
   masks of perceptual luma (Rec.709 coefficients). Highlights span 0.35…1; shadows 0…0.65.
   Whites use 0.65…1 (±0.25), blacks 0…0.35 (±0.2). These are smooth pointwise adjustments;
   no large-radius tone mapping or image-dependent analysis is hidden here.
4. Colour balance adds per-channel offsets, weighted by the same shadow/highlight masks,
   and their middle overlap. Each component ranges -100…100 (±0.25 perceptual units).
5. Master levels, channel levels, master curve, then channel curves operate on perceptual
   values. Levels use normalised input/output endpoints and positive gamma (gamma > 1 lifts).
   This bounded operation deliberately clamps HDR when active. Curves are shape-preserving
   cubic Hermite splines with harmonic tangents, baked to a 1024×1 RGBA float texture.
   Kernels manually interpolate adjacent texels using texelFetch, avoiding float filtering
   extensions. A curve with no control changes is skipped, preserving HDR.
6. Saturation, vibrance, hue and HSL use perceptual HSL. HDR is divided by its maximum channel
   (at least 1) and restored afterwards. Vibrance weights the saturation increase by
   `(1-saturation)` and reduces it by up to 80% around skin-like hues (0.08 turns).
   This is hue protection, not semantic skin detection. Negative vibrance reduces chroma
   using the same protection. Hue shift is degrees. Mixer hue ±100 maps to ±30 degrees,
   saturation to ±100%, luminance to ±0.25 HSL lightness. Eight raised-cosine ranges overlap
   smoothly and wrap around red. The HSL table is 361×1 RGBA float data, including the repeated
   endpoint. Low-level colour conversion helpers expect normalised RGB/HSL.
7. Decode back to linear light. Negative colour is floored; HDR is otherwise preserved.

## Local controls

Clarity, texture and dehaze run sequentially after tone/colour. Each saves its original,
separably blurs linear premultiplied pixels, saves the blur and binds both saved inputs to
its combination pass. Gaussian sigma is 12, 1.5 and 24 full-resolution output pixels,
respectively, multiplied by the rendering scale. Padding is the sum of each active stage's
`ceil(3*sigma*scale)` reach (both separable axes share that square reach). Blurs below the
existing Gaussian filter's 0.05 sigma threshold emit no passes and need no padding.

Clarity adds the original-minus-blurred perceptual luma, weighted towards midtones. Texture
adds the same detail without the midtone mask at a finer radius. Negative amounts soften.
Dehaze uses the blurred minimum perceptual channel as a bounded veil estimate, fixed white
airlight, and transmission bounded to 0.2: `(colour - (1-transmission))/transmission`.
Positive amounts remove veil; negative amounts add it. It is a deterministic local veil
approximation, without global atmospheric-light estimation. Saved blurs un-premultiply by
their own alpha, so transparency does not introduce black fringes.

## Statistics and verification boundary

Histogram bins are in display-perceptual space, with separate RGB and linear-luma-then-encoded
series, weighted by alpha. HDR is counted in the final bin. Clipping counts are linear-luma
black/white counts, not per-channel clipping. Auto enhance uses alpha-weighted luminance
percentiles, a bounded ±2-stop median correction and conservative tonal endpoint suggestions.
Nearly flat previews suppress contrast and endpoint stretching. Low-chroma unclipped samples
supply grey-world white balance; images without such samples retain neutral white balance.
Completely clipped pictures cannot recover lost detail. Call these helpers on a small preview
outside the filter; they do not obtain or render that preview themselves.

CPU tests cover the headless implementation. Phase 1b below records the browser and UI integration. Conformance
must especially exercise HSL ties/near-grey hue, steep gamma/curve table knots, extreme
exposure with low alpha, and long Gaussian blurs: half-float intermediate rounding and GLSL
pow/exp can differ from JavaScript doubles. Do not raise tolerances to hide those differences.
Large blurs still need the renderer's budget/worker scheduling; these synchronous kernels do
not schedule themselves and no frame timing or real GPU performance claim is made here.

## Phase 1b integration

The full tool is `glass-ux-image/tools/develop` (`develop`, `developActions`,
`useDevelop`, `DevelopBasicPanel`, `ToneCurvePanel`, `HslPanel`, `ColourBalancePanel`,
`DetailPanel`, `DevelopLevelsPanel`, `DevelopCompare`). It supplies its filter and actions
when registered in `PhotoEditor` or `createEditorSession({tools: [develop]})`.
For custom headless compositions, register the headless filter in `filters` and
`developActions` in `actions`; panels take an explicit `editor` or the nearest provider.
All final changes use actions. Host overrides/hidden actions have priority over tool actions.
Auto enhance analyses the ungraded preview and ignores stale results after another edit.

`glass-ux-image/tools/develop/basic` is independent: `BasicAdjustments` takes plain
Stage 2 adjustment values/callbacks and an optional subset of controls; `BasicPanel` binds it
to a session; `basicDevelop` registers the small Stage 2 filter. It imports no curves, HSL,
local-detail kernels, histogram or colour wheel. The in-memory library bundle check confirms
six own modules and zero advanced develop modules. It does not require the full tool entry.

Standalone controlled/uncontrolled entries are `controls/curves` (`CurvesEditor`),
`controls/levels` (`LevelsEditor`) and `controls/color-wheel` (`ColorWheel`). They accept
plain values, default values, live and committed callbacks, disabled state and wording
overrides. No session/provider is required. The colour wheel adapts Glass UX's HSV picker to
signed RGB grading offsets; exact component sliders supplement its byte-precision hex
plane. Curve input coordinates remain strictly ordered; endpoint x positions are fixed,
while y remains editable. Add/remove and all point coordinates are keyboard accessible.

`panels/histogram` exposes `HistogramPanel` and the coalescing `useDevelopPreview` hook.
It feeds Glass UX's Histogram from linear readPreview buffers. Completed results stay visible
while a newer drag preview is queued. Requests start after synchronous session notifications,
so they see the updated document. The comparison uses Glass UX's CompareSlider with two
preview images; its baseline removes develop/simple adjust while retaining current geometry,
other filters and layers. It never temporarily edits or reverts the session. Comparison is a
preview at a maximum edge of 512 by default, not an export-resolution proof.

The conformance run exposed three precision issues. Skin hue protection now uses circular
hue distance, so the mask is continuous at red. Mixer effects fade smoothly near neutral grey
(saturation 0.02…0.12), where hue is unstable. Even with those fixes, hue-dependent mixer
lightness and sequential local detail can amplify RGBA16F input/intermediate error above
0.002. The headless develop filter therefore opts into the renderer's existing full-float
precision contract. This preserves the maths and tolerance, at twice the texture memory per
surface compared with half floats. The basic entry retains the Stage 2 half-float path.
Browser conformance covers all controls and ranges at levels 0, 1 and 2, including hue ties,
near-grey pixels, low alpha/HDR, steep curves/gamma and the combined local stack.

A final browser recheck also exposed an identity-source preview wait bug: `readPreview`
waited for transformed pipeline caches but omitted the original source cache. With a
worker-backed original source, the empty wait could starve the event loop of worker replies.
The session preview wait now includes the original cache. A regression test supplies tiles
asynchronously through a timer to ensure the preview actually waits for task-driven IO.
