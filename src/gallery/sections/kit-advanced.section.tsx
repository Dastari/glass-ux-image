import { CodeBlock } from "glass-ux/ai/code-block";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { advanced } from "glass-ux-image/kits/advanced";
import { EditorStage, KitTools } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <Specimen title="In a photo editor" description="It does not include the standard tools: combine the two for the full suite, as the usage example does.">
        <div className="w-full" data-live-demo="kit-advanced">
          <EditorStage tools={advanced} />
        </div>
      </Specimen>
      <Specimen title="Tools" description="Each tool by its name and id, in list order. The first is selected when a picture opens.">
        <KitTools tools={advanced} />
      </Specimen>
      <h2>Usage</h2>
      <CodeBlock
        language="tsx"
        code={"import { standard } from 'glass-ux-image/kits/standard';\nimport { advanced } from 'glass-ux-image/kits/advanced';\nimport { PhotoEditor } from 'glass-ux-image/photo-editor';\n\nconst everything = [...standard, ...advanced];\n\nexport function Editor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={everything} />;\n}"}
      />
      <h2>API</h2>
      <p>
        <code>advanced: readonly ImageTool[]</code>. The list imports only its own tools&apos; rendering parts, so
        removing a tool also removes its code from the bundle.
      </p>
    </SectionPage>
  );
}
