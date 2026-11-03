import { SectionPage } from "glass-ux-docs-kit/react";
import { rotate } from "glass-ux-image/tools/rotate";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={rotate}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { rotate } from \"glass-ux-image/tools/rotate\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function RotateEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[rotate]} />;\n}"}
      />
    </SectionPage>
  );
}
