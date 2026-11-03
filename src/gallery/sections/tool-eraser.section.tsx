import { SectionPage } from "glass-ux-docs-kit/react";
import { eraser } from "glass-ux-image/tools/retouch/eraser";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={eraser}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { eraser } from \"glass-ux-image/tools/retouch/eraser\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function EraserEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[eraser]} />;\n}"}
      />
    </SectionPage>
  );
}
