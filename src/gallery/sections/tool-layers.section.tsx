import { SectionPage } from "glass-ux-docs-kit/react";
import { layers } from "glass-ux-image/tools/layers";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={layers}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { layers } from \"glass-ux-image/tools/layers\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function LayersEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[layers]} />;\n}"}
      />
    </SectionPage>
  );
}
