import { SectionPage } from "glass-ux-docs-kit/react";
import { canvasSize } from "glass-ux-image/tools/canvas-size";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={canvasSize}
        title="In a photo editor"
        description="Use it to add a border or make room for a caption."
        code={"import { canvasSize } from \"glass-ux-image/tools/canvas-size\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function CanvasSizeEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[canvasSize]} />;\n}"}
      />
    </SectionPage>
  );
}
