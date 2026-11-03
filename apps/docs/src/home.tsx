import { Link } from "@tanstack/react-router";
import { ButtonLink } from "glass-ux/button-link";
import { IconArrowRight } from "glass-ux/icons";
import { WorkspacePage } from "../../demo/src/workspace-page";

/**
 * The landing page: what the package is in one line, then the full photo editor running live, the way
 * the Glass UX site opens with its application demo.
 */
export function Home() {
  return (
    <div className="image-home">
      <header className="image-home-hero">
        <h1>Glass UX Image</h1>
        <p>
          Image editing components for Glass UX, from a single slider to a full photo editor. Pictures are edited in
          the browser, on the GPU where there is one, and nothing is uploaded unless the host decides to.
        </p>
        <div className="image-home-actions">
          <ButtonLink
            variant="primary"
            iconEnd={<IconArrowRight />}
            render={<Link to="/guides/$guide" params={{ guide: "getting-started" }} />}
          >
            Getting started
          </ButtonLink>
          <ButtonLink variant="secondary" render={<Link to="/templates" />}>
            Templates
          </ButtonLink>
        </div>
      </header>
      <section className="image-home-section" aria-labelledby="image-home-demo">
        <div className="image-home-heading">
          <div>
            <h2 id="image-home-demo">Photo editor</h2>
            <p className="text-fg-muted">
              Open, drop or paste a picture. Develop, retouch, add layers and text, then export. Edits are kept in this
              browser, so a refresh picks up where you left off.
            </p>
          </div>
          <ButtonLink variant="secondary" size="sm" href={`${import.meta.env.BASE_URL}demo/`}>
            Open full screen
          </ButtonLink>
        </div>
        <div className="image-home-app" data-live-demo="home-editor">
          <WorkspacePage />
        </div>
      </section>
    </div>
  );
}
