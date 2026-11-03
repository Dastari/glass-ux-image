import { SectionPage } from "glass-ux-docs-kit/react";
import { liquify } from "glass-ux-image/tools/retouch/liquify";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={liquify}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { liquify } from \"glass-ux-image/tools/retouch/liquify\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function LiquifyEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[liquify]} />;\n}"}
      />
    </SectionPage>
  );
}
