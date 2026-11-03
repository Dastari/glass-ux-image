import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CodeBlock } from "glass-ux/ai/code-block";
import { Badge } from "glass-ux/badge";
import { Button } from "glass-ux/button";
import { ButtonLink } from "glass-ux/button-link";
import { Notice } from "glass-ux/notice";
import { IconArrowLeft, IconUpload } from "glass-ux/icons";
import { CatalogueIndex } from "glass-ux-docs-kit/react";
import type { EditResult } from "glass-ux-image/session";
import { SingleAdjustment } from "../../demo/src/templates/single-adjustment";
import { AvatarCropper } from "../../demo/src/templates/avatar-cropper";
import { ProductPhoto } from "../../demo/src/templates/product-photo";
import { SocialPost } from "../../demo/src/templates/social-post";
import { Annotator } from "../../demo/src/templates/annotator";
import { DevelopView } from "../../demo/src/templates/develop-view";
import { FullSuite } from "../../demo/src/templates/full-suite";
import { templates } from "./template-catalogue";

const sources = import.meta.glob(
  "../../../src/gallery/examples/template-*.tsx.txt",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** The site's save policy: the library hands back a picture, and this page downloads it. */
function download(result: EditResult) {
  return result.toBlob({ type: "image/png" }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "edited.png";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

const sample = () => `${import.meta.env.BASE_URL}sample.png`;

/** One template's live screen, on the sample picture or the visitor's own. */
export function TemplateScreen({ id, src }: { id: string; src?: Blob }) {
  const picture = src ?? sample();
  switch (id) {
    case "single-adjustment":
      return <SingleAdjustment />;
    case "avatar-cropper":
      return <AvatarCropper src={picture} onSave={download} />;
    case "product-photo":
      return <ProductPhoto src={picture} onSave={download} />;
    case "social-post":
      return <SocialPost src={picture} />;
    case "annotator":
      return <Annotator src={picture} />;
    case "develop-view":
      return <DevelopView src={picture} />;
    default:
      return <FullSuite src={picture} />;
  }
}

/** Picks a picture from the visitor's device. Nothing leaves the browser. */
export function OwnImageButton({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="secondary" size="sm" icon={<IconUpload />} onClick={() => input.current?.click()}>
        Use your own image
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}

/** Screens that do one job, as opposed to a whole editor. */
const SMALL = ["single-adjustment", "avatar-cropper", "product-photo"];

export function TemplateIndex() {
  return (
    <article className="gallery-documentation image-docs-template-index">
      <header className="gallery-document-intro">
        <h1 className="type-display">Templates</h1>
        <p className="gallery-document-description type-body text-fg-muted">
          Finished screens built only from public entries, from a single slider to the full suite. Each one is short
          enough to copy into a project.
        </p>
      </header>
      <CatalogueIndex
        entries={templates.map((template) => ({
          id: template.id,
          title: template.title,
          summary: template.summary,
          group: SMALL.includes(template.id) ? "Single tasks" : "Editors",
          href: `${import.meta.env.BASE_URL}templates/${template.id}`,
        }))}
        groups={["Single tasks", "Editors"]}
        LinkComponent={({ entry, ...props }) => (
          <Link {...props} to="/templates/$template" params={{ template: entry.id }} />
        )}
      />
    </article>
  );
}

/** A template's page: the live screen in a bounded frame on the canvas, then its source to copy. */
export function TemplatePage({ id }: { id: string }) {
  const template = templates.find((item) => item.id === id);
  const [file, setFile] = useState<File>();
  if (!template) return <Notice tone="warning">This template is not in the catalogue.</Notice>;
  const takesImage = id !== "single-adjustment";
  return (
    <article className="gallery-documentation image-docs-template-document" aria-label={`${template.title} template`}>
      <header className="gallery-document-intro">
        <Badge>Template</Badge>
        <h1 className="type-display">{template.title}</h1>
        <p className="gallery-document-description type-body text-fg-muted">{template.summary}</p>
      </header>
      <div className="image-docs-template-actions">
        {takesImage ? <OwnImageButton onFile={setFile} /> : null}
        <ButtonLink
          variant="secondary"
          size="sm"
         
          render={<Link to="/templates/$template/preview" params={{ template: id }} />}
        >
          Open full screen
        </ButtonLink>
      </div>
      <div className="image-docs-template-stage" data-template={id} data-live-demo={`template-${id}`}>
        <TemplateScreen key={file ? `${file.name}:${file.lastModified}` : "sample"} id={id} src={file} />
      </div>
      <section className="image-docs-template-source" aria-labelledby="template-source">
        <h2 id="template-source" className="type-title">
          Source
        </h2>
        <CodeBlock
          title={`${id}.tsx`}
          language="tsx"
          code={sources[`../../../src/gallery/examples/template-${id}.tsx.txt`] ?? ""}
          maxLines={0}
        />
      </section>
    </article>
  );
}

/** A template alone, filling the window, with a way back to its page. */
export function TemplatePreview({ id, back }: { id: string; back: ReactNode }) {
  const template = templates.find((item) => item.id === id);
  const [file, setFile] = useState<File>();
  if (!template) return <Notice tone="warning">This template is not in the catalogue.</Notice>;
  return (
    <div className="image-docs-preview">
      <header className="image-docs-preview-bar">
        {back}
        <span className="type-body-strong image-docs-preview-title">{template.title}</span>
        {id !== "single-adjustment" ? <OwnImageButton onFile={setFile} /> : null}
      </header>
      <main className="image-docs-preview-screen" data-template={id}>
        <TemplateScreen key={file ? `${file.name}:${file.lastModified}` : "sample"} id={id} src={file} />
      </main>
    </div>
  );
}

export const backIcon = <IconArrowLeft />;
