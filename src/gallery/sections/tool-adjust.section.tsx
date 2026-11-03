import { SectionPage } from "glass-ux-docs-kit/react";
import { adjust } from "glass-ux-image/tools/adjust";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={adjust}
        title="In a photo editor"
        description="Offer it where people need quick fixes rather than the full develop panel."
        code={"import { adjust } from \"glass-ux-image/tools/adjust\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function AdjustEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[adjust]} />;\n}"}
      />
    </SectionPage>
  );
}
