import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor } from "glass-ux-image/react";

const photo = `${import.meta.env.BASE_URL}sample.png`;

function ImageCanvasSample() {
  const editor = useImageEditor({ source: photo });
  return (
    <ImageEditorProvider editor={editor}>
      <div className="relative aspect-3/2 w-full max-w-3xl overflow-hidden rounded-surface border border-line">
        <ImageCanvas aria-label="Mountain lake at dusk" className="absolute inset-0" />
      </div>
    </ImageEditorProvider>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="The photo, accelerated"
        description="The view of the nearest editor session. It fills its parent and draws with WebGL2 where it can. Focus it, then use the arrow keys to pan, plus and minus to zoom, and 0 to fit."
      >
        <div data-live-demo="image-canvas" className="w-full">
          <ImageCanvasSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
