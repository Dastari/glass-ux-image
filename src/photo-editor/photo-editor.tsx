import { ScrollArea } from 'glass-ux/scroll-area';
import { TruncatedText } from 'glass-ux/truncated-text';
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Accordion } from "glass-ux/accordion";
import { AlertDialog } from "glass-ux/alert-dialog";
import { Button } from "glass-ux/button";
import { useAnnounce, useHotkeys } from "glass-ux/hooks";
import { IconClose, IconMaximise, IconRedo, IconUndo, IconZoomIn, IconZoomOut } from "glass-ux/icons";
import { useMessages } from "glass-ux/i18n";
import { formatPercent, numberFormat, useLocale } from "glass-ux/locale";
import { StatusBar } from "glass-ux/status-bar";
import { Toolbar } from "glass-ux/toolbar";
import { ImageCanvas, type ImageCanvasProps } from "../canvas/index.js";
import { imageEditorMessages, type ImageEditorMessages } from "../react/messages.js";
import { ImageEditorProvider, useEditor, useEditorContext, useImageEditor, useSessionState } from "../react/session-context.js";
import { toolResetChange, type ImageTool } from "../react/tool.js";
import type { EditorSession, EditorSessionOptions } from "../session/index.js";

export interface PhotoEditorProps extends Omit<EditorSessionOptions, "source" | "tools"> {
  /** The picture: a file, blob, URL or tile source. */
  src: EditorSessionOptions["source"];
  /** The tools to offer, in order. Pass only what you need: unused tools stay out of the bundle. */
  tools: readonly ImageTool[];
  /** Shown in the title bar. */
  title?: ReactNode;
  /** Words on the save button, such as "Save to listing". */
  saveLabel?: string;
  /** Draw the title bar. Turn it off when a window or dialog supplies one. */
  header?: boolean;
  /** Draw the bottom bar. Turn it off to place `PhotoEditorStatus` elsewhere. */
  footer?: boolean;
  /** Replace any built-in words. */
  labels?: Partial<ImageEditorMessages>;
  /** An `aria-label` for the canvas. */
  canvasLabel?: string;
  /** Force a rendering backend. By default the best available is used. */
  backend?: ImageCanvasProps["backend"];
  className?: string;
}

/** Undo and redo, for the title bar or a window's own action slot. */
export function PhotoEditorActions({ editor, labels }: {
  /** Explicit session or the nearest provider. */
  editor?: EditorSession;
  /** Localised wording overrides. */
  labels?: Partial<ImageEditorMessages>;
}) {
  const session = useEditor(editor);
  const { canUndo, canRedo } = useSessionState(session);
  const messages = useMessages(imageEditorMessages, labels ? { labels } : {});
  return (
    <>
      <Button variant="ghost" size="sm" icon={<IconUndo />} aria-label={messages.undo} shortcut="mod+z" disabledReason={!canUndo ? messages.noUndo : undefined} onClick={() => session.run("edit.undo")} />
      <Button variant="ghost" size="sm" icon={<IconRedo />} aria-label={messages.redo} shortcut="mod+shift+z" disabledReason={!canRedo ? messages.noRedo : undefined} onClick={() => session.run("edit.redo")} />
    </>
  );
}

/** Size and zoom, for the bottom bar or a window's own status slot. */
export function PhotoEditorStatus({ editor, labels }: {
  /** Explicit session or the nearest provider. */
  editor?: EditorSession;
  /** Localised wording overrides. */
  labels?: Partial<ImageEditorMessages>;
}) {
  const session = useEditor(editor);
  const { size, zoom, save } = useSessionState(session);
  const messages = useMessages(imageEditorMessages, labels ? { labels } : {});
  const locale = useLocale();
  const count = (value: number) => numberFormat(locale).format(value);
  const zoomText = zoom ? messages.zoomPercent(formatPercent(locale, zoom * 100, 0)) : "\u00a0";
  return (
    <>
      <StatusBar.Item giveWay={2}>{save === "failed" ? <span role="alert">{messages.saveFailed}</span> : size ? messages.size({ width: count(size.width), height: count(size.height) }) : null}</StatusBar.Item>
      <StatusBar.Item giveWay={1}>
        <Button variant="ghost" size="xs" icon={<IconZoomOut />} aria-label={messages.zoomOut} onClick={() => session.run("view.zoomOut")} />
        <Button variant="ghost" size="xs" aria-label={`${zoomText}: ${messages.actualSize}`} tooltip={messages.actualSize} className="gi-zoom" onClick={() => session.run("view.actualSize")}>
          {zoomText}
        </Button>
        <Button variant="ghost" size="xs" icon={<IconZoomIn />} aria-label={messages.zoomIn} onClick={() => session.run("view.zoomIn")} />
        <Button variant="ghost" size="xs" icon={<IconMaximise />} aria-label={messages.fit} onClick={() => session.run("view.fit")} />
      </StatusBar.Item>
    </>
  );
}

function ToolButton({tool,ready,labels,showLabel}: {tool:ImageTool;ready:boolean;labels?:Partial<ImageEditorMessages>;showLabel:boolean}) {
  const words=useMessages(tool.messages ?? imageEditorMessages, !tool.messages && labels ? {labels} : {});
  return <Toolbar.Button value={tool.id} label={tool.label(words)} showLabel={showLabel} icon={tool.icon} disabled={!ready} {...(tool.shortcut ? {shortcut:tool.shortcut} : {})} />;
}

function Workspace({ tools, title, saveLabel, header = true, footer = true, labels, canvasLabel, backend, className }: Pick<PhotoEditorProps, "tools" | "title" | "saveLabel" | "header" | "footer" | "labels" | "canvasLabel" | "backend" | "className">) {
  const session = useEditorContext();
  const { tool: toolId, status, save, dirty, saveProgress } = useSessionState(session);
  const messages = useMessages(imageEditorMessages, labels ? { labels } : {});
  const locale = useLocale();
  const announce = useAnnounce();
  const root = useRef<HTMLDivElement>(null);
  const [discarding, setDiscarding] = useState(false);
  const active = tools.find(({ id }) => id === toolId);
  const ready = status === "ready";
  // A few tools read best with their names; a larger kit becomes a grid of icons with tooltips.
  const labelled = tools.length <= 3;
  const activeMessages=useMessages(active?.messages ?? imageEditorMessages, !active?.messages && labels ? {labels} : {});
  const resettable = active ? toolResetChange(session, active) : null;

  const announced = useRef(toolId);
  useEffect(() => {
    if (active && announced.current !== active.id) announce(messages.toolSelected(active.label(activeMessages)));
    announced.current = toolId;
  }, [active, activeMessages, announce, messages, toolId]);

  const scope = { scope: root, enabled: ready };
  useHotkeys("mod+z", () => session.run("edit.undo"), scope);
  useHotkeys("mod+shift+z", () => session.run("edit.redo"), scope);
  useHotkeys("mod+s", () => session.run("file.save"), scope);
  const toolKeys = tools.flatMap(({ shortcut }) => (shortcut ? [shortcut] : []));
  useHotkeys(toolKeys, (event) => {
    const tool = tools.find(({ shortcut }) => shortcut === event.key.toLowerCase());
    if (tool) session.run("tool.select", tool.id);
  }, scope);

  const cancel = () => {
    if (dirty) setDiscarding(true);
    else session.run("file.cancel");
  };
  const saving = save === "saving";
  const canSave = session.action("file.save").available && session.canSave;
  const hasSave = session.action("file.save").available && session.savable;
  const progress = saving && saveProgress ? ` ${formatPercent(locale, saveProgress * 100, 0)}` : "";

  return (
    <div ref={root} className={["gi-photo-editor", className].filter(Boolean).join(" ")}>
      <div className="gi-photo-layout" data-header={header ? "" : undefined} data-footer={footer ? "" : undefined}>
      {header && (
        <header className="gi-photo-title">
          <TruncatedText className="gi-photo-name">{title}</TruncatedText>
          <PhotoEditorActions {...(labels ? { labels } : {})} />
          {session.closable && <Button variant="ghost" size="sm" icon={<IconClose />} aria-label={messages.close} onClick={cancel} />}
        </header>
      )}
      <ImageCanvas className="gi-photo-stage" {...(backend ? { backend } : {})} {...(canvasLabel ? { "aria-label": canvasLabel } : {})}>
        {active?.Overlay && <active.Overlay />}
      </ImageCanvas>
      <aside className="gi-photo-side" aria-label={active ? active.label(activeMessages) : undefined}><ScrollArea orientation="vertical" edges="hairline">
        {tools.length > 1 && (
          <Toolbar aria-label={messages.tools} size="sm" overflow={false}>
            <Toolbar.Group aria-label={messages.tools} value={toolId ?? ""} onValueChange={(id: string) => session.run("tool.select", id)}>
              {tools.map((tool) => (
                <ToolButton key={tool.id} tool={tool} ready={ready} showLabel={labelled} {...(labels ? {labels} : {})} />
              ))}
            </Toolbar.Group>
            <Toolbar.Spacer />
            <Toolbar.Button label={messages.reset} showLabel priority="always" tooltip={active ? messages.resetTool(active.label(activeMessages)) : false} disabled={!resettable} disabledReason={resettable ? undefined : messages.nothingToReset} onClick={() => { if (resettable && active) session.commit(resettable, { label: messages.resetTool(active.label(activeMessages)) }); }} />
          </Toolbar>
        )}
        {/* With icon-only tools, the chosen tool's name heads its settings. */}
        {ready && active && !labelled && <h2 className="gi-photo-tool-title">{active.label(activeMessages)}</h2>}
        {ready && (active?.Panel ? <active.Panel /> : active?.Sections && (
          <Accordion.Root key={active.id} defaultValue={active.Sections.map(section=>section.id)} multiple>
            {active.Sections.map(({id,label,Panel})=><Accordion.Item key={id} value={id} title={label(activeMessages)}><Panel /></Accordion.Item>)}
          </Accordion.Root>
        ))}
      </ScrollArea></aside>
      {footer && (
        <StatusBar className="gi-photo-foot" aria-label={messages.tools}>
          <StatusBar.Start>
            <PhotoEditorStatus {...(labels ? { labels } : {})} />
          </StatusBar.Start>
          <StatusBar.End>
            {session.closable && (
              <Button variant="secondary" size="sm" onClick={cancel}>
                {messages.cancel}
              </Button>
            )}
            {hasSave && (
              <Button
                variant="primary"
                size="sm"
                disabled={!canSave && !saving}
                {...(saving ? { status: "pending" as const } : save === "saved" ? { status: "success" as const } : save === "failed" ? { status: "error" as const } : {})}
                pendingLabel={`${messages.saving}${progress}`}
                successLabel={messages.saved}
                onClick={() => session.run("file.save")}
              >
                {saveLabel ?? messages.save}
              </Button>
            )}
          </StatusBar.End>
        </StatusBar>
      )}
      </div>
      <AlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        tone="warning"
        title={messages.discardTitle}
        description={messages.discardBody}
        confirmLabel={messages.discardConfirm}
        cancelLabel={messages.keepEditing}
        onConfirm={() => session.run("file.cancel")}
      />
    </div>
  );
}

/**
 * A window-sized photo editor. It fills its parent, so a dialog, a window or a page section sets its
 * size. It saves nothing by itself: `onSave` receives the result and the host stores it.
 *
 * @example
 * <PhotoEditor src={photo.url} tools={[crop, rotate, adjust]} onSave={async (result, { signal }) => {
 *   await upload(await result.toBlob({ type: "image/webp", quality: 0.82 }), { signal });
 * }} />
 */
export function PhotoEditor({ src, tools, title, saveLabel, header, footer, labels, canvasLabel, backend, className, ...options }: PhotoEditorProps) {
  const session = useImageEditor({ ...options, source: src, tools });
  const view = { tools, title, saveLabel, header, footer, labels, canvasLabel, backend, className };
  return <PhotoEditorView editor={session} {...view} />;
}

export type PhotoEditorViewProps = Pick<PhotoEditorProps, "tools" | "title" | "saveLabel" | "header" | "footer" | "labels" | "canvasLabel" | "backend" | "className"> & {
  /** A session from `useImageEditor`. */
  editor: EditorSession;
};

/**
 * `PhotoEditor` over a session the host already holds, for when something outside needs it too. In a
 * managed window, turn off `header` and `footer` and put `PhotoEditorActions` and `PhotoEditorStatus`
 * in `Window.Actions` and `Window.Status`.
 */
export function PhotoEditorView({ editor, ...view }: PhotoEditorViewProps) {
  return (
    <ImageEditorProvider editor={editor}>
      <Workspace {...view} />
    </ImageEditorProvider>
  );
}
