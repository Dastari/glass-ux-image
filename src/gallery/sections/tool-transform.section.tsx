import { SectionPage } from "glass-ux-docs-kit/react";
import { transform } from "glass-ux-image/tools/transform";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={transform}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { transform } from \"glass-ux-image/tools/transform\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function TransformEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[transform]} />;\n}"}
      />
    </SectionPage>
  );
}
