import { SectionPage } from "glass-ux-docs-kit/react";
import { blurBrush } from "glass-ux-image/tools/retouch/blur";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={blurBrush}
        title="In a photo editor"
        description="Use it to calm a busy background or a distracting texture."
        code={"import { blurBrush } from \"glass-ux-image/tools/retouch/blur\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function BlurBrushEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[blurBrush]} />;\n}"}
      />
    </SectionPage>
  );
}
