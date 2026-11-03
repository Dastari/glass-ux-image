import { SectionPage } from "glass-ux-docs-kit/react";
import { resize } from "glass-ux-image/tools/resize";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={resize}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { resize } from \"glass-ux-image/tools/resize\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function ResizeEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[resize]} />;\n}"}
      />
    </SectionPage>
  );
}
