import { SectionPage } from "glass-ux-docs-kit/react";
import { sharpenBrush } from "glass-ux-image/tools/retouch/sharpen";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={sharpenBrush}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { sharpenBrush } from \"glass-ux-image/tools/retouch/sharpen\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function SharpenBrushEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[sharpenBrush]} />;\n}"}
      />
    </SectionPage>
  );
}
