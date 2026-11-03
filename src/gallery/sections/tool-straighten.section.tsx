import { SectionPage } from "glass-ux-docs-kit/react";
import { straighten } from "glass-ux-image/tools/straighten";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={straighten}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { straighten } from \"glass-ux-image/tools/straighten\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function StraightenEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[straighten]} />;\n}"}
      />
    </SectionPage>
  );
}
