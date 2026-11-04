import { defineMessages } from "glass-ux/i18n";
import type { MessageValues } from "./types.js";

/** Words shared by the public workspace parts and the browser application. */
export const workspaceMessages = defineMessages("imageEditor.workspace", {
  workspace: "Image workspace", library:"Library", file: "File", edit: "Edit", view: "View", help: "Help",
  history: "History", presets: "Presets", layers: "Layers", filmstrip: "Open pictures",
  original: "Original", step: "Edit step", settings: "Tool settings", develop: "Develop",
  geometry: "Geometry", retouch: "Retouch", effects: "Effects", files: "Files",
  docked: "Docked", focus: "Focus", compare: "Before and after", before: "Before", after: "After",
  shortcuts: "Keyboard shortcuts", commands: "Command palette", nextRegion: "Next region", previousRegion: "Previous region",
  unavailable: "This command is unavailable now", pan: "Pan (hold Space and drag)",
  open: "Open images", save: "Save copy", export: "Export", copy: "Copy image", paste: "Paste image",
  recover: "Recover previous session", recovery: "A previous editing session is available.",
  failed: "The operation could not be completed. Try again.", autosave: "Recovery enabled", noAutosave: "Recovery unavailable",
  templates: "Templates", photo: "Photo editor", custom: "Custom layout", engine: "Engine",
  singleSlider: "Single adjustment", avatar: "Avatar cropper", product: "Product photo", social: "Social post",
  annotator: "Annotator", developView: "Develop view", fullSuite: "Full suite", format: "Format", demo: "Demo",
});
export type WorkspaceMessages = MessageValues<typeof workspaceMessages.defaults>;

// Typed packs and overrides: Glass UX merges namespaces through its catalog module.
declare module "glass-ux/i18n/catalog" {
  interface MessageCatalog { "imageEditor.workspace": WorkspaceMessages }
}
