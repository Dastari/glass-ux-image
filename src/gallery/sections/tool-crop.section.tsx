import { SectionPage } from "glass-ux-docs-kit/react";
import { crop } from "glass-ux-image/tools/crop";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={crop}
        title="In a photo editor"
        description="Most editors offer it first."
        code={"import { crop } from \"glass-ux-image/tools/crop\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function CropEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[crop]} />;\n}"}
      />
    </SectionPage>
  );
}
