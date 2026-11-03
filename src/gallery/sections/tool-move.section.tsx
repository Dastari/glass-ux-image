import { SectionPage } from "glass-ux-docs-kit/react";
import { move } from "glass-ux-image/tools/move";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={move}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { move } from \"glass-ux-image/tools/move\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function MoveEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[move]} />;\n}"}
      />
    </SectionPage>
  );
}
