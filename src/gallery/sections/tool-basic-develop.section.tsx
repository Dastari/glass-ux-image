import { SectionPage } from "glass-ux-docs-kit/react";
import { basicDevelop } from "glass-ux-image/tools/develop/basic";
import { ToolPage } from "../tool-page.js";

export default function Section() {
  return (
    <SectionPage>
      <ToolPage
        tool={basicDevelop}
        title="In a photo editor"
        description="Use it for a lighter editor than full develop."
        code={"import { basicDevelop } from \"glass-ux-image/tools/develop/basic\";\nimport { PhotoEditor } from \"glass-ux-image/photo-editor\";\n\nexport function BasicDevelopEditor({ src }: { src: string }) {\n  return <PhotoEditor src={src} tools={[basicDevelop]} />;\n}"}
      />
    </SectionPage>
  );
}
