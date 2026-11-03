import { SectionPage } from "glass-ux-docs-kit/react";
import { healingBrush } from "glass-ux-image/tools/retouch/heal";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={healingBrush}
        title="In a photo editor"
        description="Use it for blemishes on skin and fabric."
        code={"import { healingBrush } from \"glass-ux-image/tools/retouch/heal\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function HealingBrushEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[healingBrush]} />;\n}"}
      />
    </SectionPage>
  );
}
