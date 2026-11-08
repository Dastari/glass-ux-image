import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Textarea } from "glass-ux/textarea";
import { Button } from "glass-ux/button";
import { useMessages } from "glass-ux/i18n";
import { layersMessages } from "../../messages/layers.js";
import type { TextSpec } from "../../layers-text/index.js";

/** Standalone positioned editor; the host owns placement, preview and commits. */
export interface TextEditorProps {
  /** Text spec at the beginning of this edit. Remount with a new key to edit a different layer. */
  value: TextSpec;
  /** CSS placement in the containing stage. Image coordinates do not mirror. */
  style?: CSSProperties;
  /** Reports draft input; the session wrapper uses this only for transient previews. */
  onPreview?: (value: TextSpec) => void;
  /** Commits on blur, Ctrl/Command+Enter, or the finish button. */
  onCommit: (value: TextSpec) => void;
  /** Cancels on Escape or the cancel button. */
  onCancel: () => void;
}
/** Native text composition remains intact for IMEs; newline inserts a line, Escape cancels. */
export function TextEditor({ value, style, onPreview, onCommit, onCancel }: TextEditorProps) {
  const m = useMessages(layersMessages), [content, setContent] = useState(value.content);
  const input = useRef<HTMLTextAreaElement>(null), ended = useRef(false);
  useEffect(() => { input.current?.focus({ preventScroll: true }); input.current?.select(); }, []);
  const finish = () => { if (!ended.current) { ended.current = true; onCommit({ ...value, content }); } };
  const cancel = () => { if (!ended.current) { ended.current = true; onCancel(); } };
  return <div className="gi-text-edit-wrap" data-canvas-tool="" style={style} onPointerDown={event => event.stopPropagation()}>
    {/* The editor matches the layer's own size on the picture, so it opts out of Glass UX's 16 px touch floor. */}
    <Textarea ref={input} aria-label={m.editText} dir={value.direction} value={content} resize={false} wrap={value.boxWidth ? "soft" : "off"} data-own-font-size=""
      style={{ fontFamily: value.fontFamily, fontSize: value.fontSize, fontWeight: value.fontWeight,
        fontStyle: value.fontStyle, lineHeight: `${value.lineHeight}px`, letterSpacing: `${value.letterSpacing}px`,
        textAlign: value.alignment, inlineSize: value.boxWidth ?? Math.max(value.fontSize * 8, 160) }}
      onValueChange={content => { setContent(content); onPreview?.({ ...value, content }); }}
      onBlur={event => { if (!event.currentTarget.closest(".gi-text-edit-wrap")?.contains(event.relatedTarget as Node)) finish(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); cancel(); }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finish(); }
      }} />
    <div className="gi-layers-actions">
      <Button size="sm" variant="secondary" onClick={cancel}>{m.cancel}</Button><Button size="sm" variant="primary" onClick={finish}>{m.finish}</Button>
    </div>
  </div>;
}
