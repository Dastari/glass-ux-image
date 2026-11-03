import { SectionPage } from "glass-ux-docs-kit/react";
import { dodge } from "glass-ux-image/tools/retouch/dodge";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={dodge}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { dodge } from \"glass-ux-image/tools/retouch/dodge\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function DodgeEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[dodge]} />;\n}"}
      />
    </SectionPage>
  );
}
