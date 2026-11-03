import { SectionPage } from "glass-ux-docs-kit/react";
import { spotHealing } from "glass-ux-image/tools/retouch/spot-heal";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={spotHealing}
        title="In a photo editor"
        description="The tool on its own in a PhotoEditor, on the sample photo."
        code={"import { spotHealing } from \"glass-ux-image/tools/retouch/spot-heal\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function SpotHealingEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[spotHealing]} />;\n}"}
      />
    </SectionPage>
  );
}
