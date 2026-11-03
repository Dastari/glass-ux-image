import { SectionPage } from "glass-ux-docs-kit/react";
import { batchTool } from "glass-ux-image/tools/export";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={batchTool}
        title="In a photo editor"
        description="Offer it where people prepare sets, such as a product range."
        code={"import { batchTool } from \"glass-ux-image/tools/export\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function BatchToolEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[batchTool]} />;\n}"}
      />
    </SectionPage>
  );
}
