import { SectionPage } from "glass-ux-docs-kit/react";
import { redEyeRemoval } from "glass-ux-image/tools/retouch/red-eye";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={redEyeRemoval}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { redEyeRemoval } from \"glass-ux-image/tools/retouch/red-eye\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function RedEyeRemovalEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[redEyeRemoval]} />;\n}"}
      />
    </SectionPage>
  );
}
