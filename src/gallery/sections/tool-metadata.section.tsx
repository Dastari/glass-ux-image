import { SectionPage } from "glass-ux-docs-kit/react";
import { metadataTool } from "glass-ux-image/tools/export";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={metadataTool}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { metadataTool } from \"glass-ux-image/tools/export\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function MetadataToolEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[metadataTool]} />;\n}"}
      />
    </SectionPage>
  );
}
