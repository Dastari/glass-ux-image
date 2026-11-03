import { SectionPage } from "glass-ux-docs-kit/react";
import { text } from "glass-ux-image/tools/text";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={text}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { text } from \"glass-ux-image/tools/text\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function TextEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[text]} />;\n}"}
      />
    </SectionPage>
  );
}
