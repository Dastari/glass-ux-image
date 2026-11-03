import { SectionPage } from "glass-ux-docs-kit/react";
import { colourReplacement } from "glass-ux-image/tools/retouch/colour-replace";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={colourReplacement}
        title="In a photo editor"
        description="Use it to recolour clothing or a product."
        code={"import { colourReplacement } from \"glass-ux-image/tools/retouch/colour-replace\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function ColourReplacementEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[colourReplacement]} />;\n}"}
      />
    </SectionPage>
  );
}
