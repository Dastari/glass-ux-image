import { SectionPage } from "glass-ux-docs-kit/react";
import { effects } from "glass-ux-image/tools/effects";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={effects}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { effects } from \"glass-ux-image/tools/effects\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function EffectsEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[effects]} />;\n}"}
      />
    </SectionPage>
  );
}
