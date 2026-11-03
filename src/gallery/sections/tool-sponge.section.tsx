import { SectionPage } from "glass-ux-docs-kit/react";
import { sponge } from "glass-ux-image/tools/retouch/sponge";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={sponge}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { sponge } from \"glass-ux-image/tools/retouch/sponge\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function SpongeEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[sponge]} />;\n}"}
      />
    </SectionPage>
  );
}
