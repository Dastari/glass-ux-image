import { adjust } from "../filters/adjust.js";
import { gaussianBlur } from "../filters/gaussian-blur.js";
import { sharpen } from "../filters/sharpen.js";
import { develop } from "../filters/develop/index.js";
import { effectFilters } from "../filters/effects/catalogue.js";
import { effectStack } from "../filters/effects/stack.js";

// Shared by the worker and the lazy identity check in the calling realm.
export const cpuWorkerFilters = [
  adjust,
  gaussianBlur,
  sharpen,
  develop,
  ...effectFilters,
  effectStack,
];
