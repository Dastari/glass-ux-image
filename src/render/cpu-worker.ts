import { cpuWorkerFilters } from "./cpu-worker-filters.js";
import { createCpuWorkerHandler } from "./cpu-worker-handler.js";
import type {
  CpuCompositionReply,
  CpuCompositionRequest,
} from "./cpu-worker-protocol.js";

const compose = createCpuWorkerHandler(cpuWorkerFilters);
self.onmessage = ({ data }: MessageEvent<CpuCompositionRequest>) => {
  try {
    const { pixels, bytes } = compose(data);
    self.postMessage({ pixels, bytes } satisfies CpuCompositionReply, {
      transfer: [pixels.data.buffer, bytes.buffer],
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    } satisfies CpuCompositionReply);
  }
};
