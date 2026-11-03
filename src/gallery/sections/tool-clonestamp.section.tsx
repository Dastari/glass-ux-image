import { SectionPage } from "glass-ux-docs-kit/react";
import { cloneStamp } from "glass-ux-image/tools/retouch/clone";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={cloneStamp}
        title="In a photo editor"
        description="Use it to remove distractions such as wires or litter."
        code={"import { cloneStamp } from \"glass-ux-image/tools/retouch/clone\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function CloneStampEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[cloneStamp]} />;\n}"}
      />
    </SectionPage>
  );
}
