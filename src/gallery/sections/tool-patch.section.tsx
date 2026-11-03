import { SectionPage } from "glass-ux-docs-kit/react";
import { patch } from "glass-ux-image/tools/retouch/patch";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={patch}
        title="In a photo editor"
        description="Use it for areas larger than the healing brush suits."
        code={"import { patch } from \"glass-ux-image/tools/retouch/patch\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function PatchEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[patch]} />;\n}"}
      />
    </SectionPage>
  );
}
