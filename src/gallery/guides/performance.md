# Performance and large images

Import the entries and tools you use. Kits are separate lists; a basic import must not pull retouch, text, full develop or effects code. Bundle limits in scripts/size-budgets.mjs are regression budgets, not download measurements. The size script includes React, lazy JavaScript and emitted workers; the kit's consumer check externalises React and measures the initial chunk. Run both.

The viewport requests tiled pyramid levels. Pixels inside core and filters are linear premultiplied RGBA. Keep a stable source, reuse caches and dispose sessions when the host closes them. Large decodes run in a worker. Filter passes use the renderer budget; a large local kernel may still stall CPU work. Do not promise a fixed frame rate from an image dimension.

Avoid React state updates per pointer frame. Write transient overlay positions directly, preview during a drag and commit at its end. Thumbnail work coalesces and runs off-thread; prefer readPreview with a bounded edge for histograms and comparisons. Do not render full exports every time a slider moves.

WebGL2 is the primary backend and CPU is the fallback. Loss of context triggers fallback. Optional codecs load on demand. Browser tests here use SwiftShader, which emulates WebGL2 on the CPU. Their timings find stalls; they do not measure real GPU speed. Measure the target device before claiming performance.
