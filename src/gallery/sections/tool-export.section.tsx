import { SectionPage } from "glass-ux-docs-kit/react";
import { exportTool } from "glass-ux-image/tools/export";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={exportTool}
        title="In a photo editor"
        description="The library encodes the file; the host decides where it goes."
        code={"import { exportTool } from \"glass-ux-image/tools/export\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function ExportToolEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[exportTool]} />;\n}"}
      />
    </SectionPage>
  );
}
