import { SectionPage } from "glass-ux-docs-kit/react";
import { smudge } from "glass-ux-image/tools/retouch/smudge";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={smudge}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { smudge } from \"glass-ux-image/tools/retouch/smudge\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function SmudgeEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[smudge]} />;\n}"}
      />
    </SectionPage>
  );
}
