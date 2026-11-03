import { SectionPage } from "glass-ux-docs-kit/react";
import { burn } from "glass-ux-image/tools/retouch/burn";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={burn}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { burn } from \"glass-ux-image/tools/retouch/burn\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function BurnEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[burn]} />;\n}"}
      />
    </SectionPage>
  );
}
