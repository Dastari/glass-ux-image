import { SectionPage } from "glass-ux-docs-kit/react";
import { develop } from "glass-ux-image/tools/develop";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={develop}
        title="In a photo editor"
        description="Use it for photographic editing."
        code={"import { develop } from \"glass-ux-image/tools/develop\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function DevelopEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[develop]} />;\n}"}
      />
    </SectionPage>
  );
}
