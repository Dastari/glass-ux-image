import { SectionPage } from "glass-ux-docs-kit/react";
import { brush } from "glass-ux-image/tools/retouch/brush";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={brush}
        title="In a photo editor"
        description="Use it for marking up a picture or simple retouching."
        code={"import { brush } from \"glass-ux-image/tools/retouch/brush\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function BrushEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[brush]} />;\n}"}
      />
    </SectionPage>
  );
}
