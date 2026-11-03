import { CodeBlock } from "glass-ux/ai/code-block";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { basic } from "glass-ux-image/kits/basic";
import { EditorStage, KitTools } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <Specimen title="In a photo editor" description="Enough for an avatar or a product photo. Spread, filter or extend the list to choose what the host offers.">
        <div className="w-full" data-live-demo="kit-basic">
          <EditorStage tools={basic} />
        </div>
      </Specimen>
      <Specimen title="Tools" description="Each tool by its name and id, in list order. The first is selected when a picture opens.">
        <KitTools tools={basic} />
      </Specimen>
      <h2>Usage</h2>
      <CodeBlock
        language="tsx"
        code={"import { basic } from 'glass-ux-image/kits/basic';\nimport { PhotoEditor } from 'glass-ux-image/photo-editor';\n\nexport function Editor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={basic} />;\n}"}
      />
      <h2>API</h2>
      <p>
        <code>basic: readonly ImageTool[]</code>. The list imports only its own tools&apos; rendering parts, so
        removing a tool also removes its code from the bundle.
      </p>
    </SectionPage>
  );
}
