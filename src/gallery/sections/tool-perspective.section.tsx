import { SectionPage } from "glass-ux-docs-kit/react";
import { perspective } from "glass-ux-image/tools/perspective";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={perspective}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo. Drag along two edges that should be vertical to correct them."
        code={"import { perspective } from \"glass-ux-image/tools/perspective\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function PerspectiveEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[perspective]} />;\n}"}
      />
    </SectionPage>
  );
}
