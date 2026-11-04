export { blendPixels } from "./blend.js";
export { composeDocument, composeTile, type CacheLookup, type ComposeOptions } from "./compose.js";
export { CpuBackend } from "./cpu-backend.js";
export { createRenderBackend, type BackendOptions } from "./create.js";
export { Renderer, type RendererOptions, type RendererStats } from "./renderer.js";
export * from "./types.js";
export { WebGL2Backend } from "./webgl2-backend.js";

export { createCpuWorkerHandler } from "./cpu-worker-handler.js";
export type { CpuCompositionRequest, CpuCompositionReply } from "./cpu-worker-protocol.js";
