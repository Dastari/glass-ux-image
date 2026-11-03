// The opt-in tool and kit pages: one PhotoEditor on the sample photo, then usage and API.
import type { ReactNode } from "react";
import { Specimen } from "glass-ux-docs-kit/react";
import { CodeBlock } from "glass-ux/ai/code-block";
import { useMessages } from "glass-ux/i18n";
import { PhotoEditor } from "glass-ux-image/photo-editor";
import { imageEditorMessages, type ImageTool } from "glass-ux-image/react";
import { samplePhoto } from "./sample.js";

/** A PhotoEditor on the sample photo, in a stage the height of a dialog. */
export function EditorStage({ tools }: { tools: readonly ImageTool[] }) {
  return (
    <div className="h-160 w-full min-w-0 overflow-hidden rounded-surface border border-line">
      <PhotoEditor src={samplePhoto} tools={tools} />
    </div>
  );
}

export interface ToolPageProps {
  /** The tool descriptor on show. */
  tool: ImageTool;
  /** The specimen title. */
  title: string;
  /** When a host offers the tool, in one or two sentences. */
  description: string;
  /** The usage example: plain code that typechecks against the public entries. */
  code: string;
  /** The API notes particular to this tool. */
  children?: ReactNode;
}

/** A tool's page: the tool alone in a PhotoEditor, a usage example and its API notes. */
export function ToolPage({ tool, title, description, code, children }: ToolPageProps) {
  return (
    <>
      <Specimen title={title} description={description}>
        <div className="w-full" data-live-demo={`tool-${tool.id}`}>
          <EditorStage tools={[tool]} />
        </div>
      </Specimen>
      <h2>Usage</h2>
      <CodeBlock language="tsx" code={code} />
      <h2>API</h2>
      <p>
        <code>{tool.id}</code> is an <code>ImageTool</code> descriptor: an id, a label, an icon and
        the panel and overlay that edit with it. Pass it in <code>tools</code> and the session
        registers its actions; select it with <code>{`editor.run('tool.select', '${tool.id}')`}</code>.
        Previews stay transient, and Apply commits through <code>onAction</code>.
        {children && <> {children}</>}
      </p>
      <a href={`${import.meta.env.BASE_URL}api/`}>Complete typed reference</a>
    </>
  );
}

function ToolName({ tool }: { tool: ImageTool }) {
  const words = useMessages(tool.messages ?? imageEditorMessages);
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden="true" className="text-fg-muted">
        {tool.icon}
      </span>
      <span>{tool.label(words)}</span>
      <code className="type-caption text-fg-muted">{tool.id}</code>
    </li>
  );
}

/** A kit's tools in order, by their localised names. */
export function KitTools({ tools }: { tools: readonly ImageTool[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <ToolName key={tool.id} tool={tool} />
      ))}
    </ul>
  );
}
