import { createRetouchStage } from './store.js';
/** Shared opt-in stage used by individual retouch tools; preview bypasses recipe/UI state. */
export const retouchStage = createRetouchStage();
