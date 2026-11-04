import { useState } from "react";
import { Select } from "glass-ux/select";
import { useMessages } from "glass-ux/i18n";
import { BLEND_MODES, type BlendMode } from "../core/document.js";
import { layersMessages } from "../messages/layers.js";
import { useLayers } from "../react/session-context.js";
import type { EditorSession } from "../session/index.js";

/** Standalone blend selection; does not require a session. */
export interface BlendModeSelectProps {
  /** Controlled blend mode. */
  value?: BlendMode;
  /** Initial mode when uncontrolled. */
  defaultValue?: BlendMode;
  /** Called when a mode is chosen. */
  onValueChange?: (value: BlendMode) => void;
  /** Disables editing. */
  disabled?: boolean;
  /** Accessible name; defaults to the translated blend-mode label. */
  "aria-label"?: string;
}
/** The message key naming each blend mode, in `BLEND_MODES` order. */
export const blendModeKeys = ["normalMode", "multiply", "screen", "overlay", "softLight", "hardLight", "darken", "lighten", "difference", "exclusion", "colourDodge", "colourBurn", "hue", "saturation", "colourMode", "luminosity"] as const;
const keys = blendModeKeys;
/** All sixteen linear-light blend modes. */
export function BlendModeSelect({ value, defaultValue = "normal", onValueChange, disabled, "aria-label": label }: BlendModeSelectProps) {
  const messages = useMessages(layersMessages);
  const [local, setLocal] = useState(defaultValue);
  return <Select size="sm" aria-label={label ?? messages.blend} disabled={disabled} value={value ?? local}
    options={BLEND_MODES.map((mode, i) => ({ value: mode, label: messages[keys[i]!] }))}
    onValueChange={mode => { if (mode) { if (value === undefined) setLocal(mode); onValueChange?.(mode); } }} />;
}
/** Session-bound blend selection props. */
export interface SessionBlendModeSelectProps {
  /** Explicit session, or the nearest editor provider. */
  session?: EditorSession;
}
/** Edits the selected layer through an intercepted, labelled action. */
export function SessionBlendModeSelect({ session }: SessionBlendModeSelectProps) {
  const { selectedLayer, update } = useLayers(session), messages = useMessages(layersMessages);
  return <BlendModeSelect disabled={!selectedLayer} value={selectedLayer?.blend ?? "normal"}
    onValueChange={blend => selectedLayer && update(selectedLayer.id, { blend }, messages.blend)} />;
}
