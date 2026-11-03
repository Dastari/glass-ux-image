import { SectionPage } from "glass-ux-docs-kit/react";
import { filesTool } from "glass-ux-image/tools/export";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={filesTool}
        title="In a photo editor"
        description="The host supplies the files; the library never reads storage by itself."
        code={"import { filesTool } from \"glass-ux-image/tools/export\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function FilesToolEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[filesTool]} />;\n}"}
      />
    </SectionPage>
  );
}
