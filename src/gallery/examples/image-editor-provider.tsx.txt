import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useSessionState } from "glass-ux-image/react";
import { BasicPanel, basicDevelop } from "glass-ux-image/tools/develop/basic";

const photo = `${import.meta.env.BASE_URL}sample.png`;

function ImageEditorProviderSample() {
  // One session, shared by everything inside the provider.
  const editor = useImageEditor({ source: photo, tools: [basicDevelop] });
  const { status } = useSessionState(editor);
  return (
    <ImageEditorProvider editor={editor}>
      <div className="flex h-120 w-full min-w-0 overflow-hidden rounded-surface border border-line">
        <div className="relative min-w-0 flex-1">
          <ImageCanvas aria-label="Mountain lake at dusk" className="absolute inset-0" />
        </div>
        <div className="w-80 shrink-0 overflow-y-auto border-s border-line p-4">
          {status === "ready" && <BasicPanel />}
        </div>
      </div>
    </ImageEditorProvider>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Share one session"
        description="useImageEditor opens a picture and ends the session with the component; the provider hands it to every part inside. Here a canvas and a panel edit the same photo."
      >
        <div data-live-demo="image-editor-provider" className="w-full">
          <ImageEditorProviderSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
