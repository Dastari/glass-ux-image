import { SectionPage } from "glass-ux-docs-kit/react";
import { flip } from "glass-ux-image/tools/flip";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={flip}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { flip } from \"glass-ux-image/tools/flip\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function FlipEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[flip]} />;\n}"}
      />
    </SectionPage>
  );
}
