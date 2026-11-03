// The site frame, copied once by `glass-ux-docs init`. It is yours to change: brand, navigation
// and a landing page belong here. Updating the kit does not touch this file.
import {
  DocsDirection,
  LANGUAGES,
  restoreDocsLanguage,
  setDocsLanguage,
  useDocsLanguage,
  type DocsLanguage,
} from "./language.js";
import { createRoot } from "react-dom/client";
import {
  createContext,
  lazy,
  Suspense,
  use,
  useRef,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import {
  AppearanceProvider,
  useAppearance,
  PALETTES,
  PALETTE_LABELS,
  BACKGROUNDS,
  BACKGROUND_LABELS,
  configureAppearance,
  appearanceConfig,
  type GlassRendering,
  type Appearance,
  type VisualStyle,
} from "glass-ux/appearance";
import { ActionProvider } from "glass-ux/actions";
import { PaletteProvider } from "glass-ux/command-palette";
import { TooltipProvider } from "glass-ux/tooltip";
import { Segmented } from "glass-ux/segmented";
import { SwatchPicker } from "glass-ux/swatch-picker";
import { Select } from "glass-ux/select";
import { Button } from "glass-ux/button";
import { ButtonLink } from "glass-ux/button-link";
import { Dialog } from "glass-ux/dialog";
import { Popover } from "glass-ux/popover";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "glass-ux/sidebar";
import {
  IconSun,
  IconMoon,
  IconSystem,
  IconSidebar,
  IconSettings,
  IconGithub,
  IconCode,
  IconArrowLeft,
} from "glass-ux/icons";
import { Skeleton } from "glass-ux/skeleton";
import {
  ComponentDocumentation,
  DocsKitProvider,
  FoundationDocumentation,
  LibraryGuide,
  siteRuntime,
} from "glass-ux-docs-kit/react";
import { site as generatedSite } from "../../../src/gallery/site.generated";
const site = {
  ...generatedSite,
  docsSourceUrl: null,
  loadGuide: async (id: string) => {
    const text = await generatedSite.loadGuide(id);
    return text.replace(
      /\]\(([^):#]+)\.md(#[^)]*)?\)/g,
      (_match, name, hash) =>
        `](#docs-guide-${encodeURIComponent(name + (hash ?? ""))})`,
    );
  },
};
import "./styles.css";

import { templates } from "./template-catalogue";
const TemplateIndex = lazy(() =>
  import("./templates").then((m) => ({ default: m.TemplateIndex })),
);
const TemplatePage = lazy(() =>
  import("./templates").then((m) => ({ default: m.TemplatePage })),
);
const TemplatePreview = lazy(() =>
  import("./templates").then((m) => ({ default: m.TemplatePreview })),
);
const Home = lazy(() => import("./home").then((m) => ({ default: m.Home })));
const runtime = siteRuntime(site);
const foundations = runtime.sections.filter(
  (section) => section.group === "Foundations",
);

/** Components by what a host uses them for, in the order the directory lists them. */
const COMPONENT_GROUPS = [
  { id: "editors", title: "Editors", families: ["editor", "photo-editor", "canvas", "react"] },
  {
    id: "panels",
    title: "Panels",
    families: ["develop", "histogram", "history", "layers", "presets", "filmstrip", "effects", "retouch", "text", "export", "metadata", "batch"],
  },
  { id: "controls", title: "Controls", families: [] },
] as const;
const componentGroup = (family: string) =>
  COMPONENT_GROUPS.find((group) => (group.families as readonly string[]).includes(family))?.id ?? "controls";

/** Tools, filters and kits are reference pages; they are grouped here the way a host chooses them. */
const SECTION_GROUPS: ReadonlyArray<{ id: string; title: string; ids: readonly string[] }> = [
  { id: "kits", title: "Kits", ids: ["kit-basic", "kit-standard", "kit-advanced"] },
  {
    id: "geometry-tools",
    title: "Geometry tools",
    ids: ["tool-crop", "tool-resize", "tool-rotate", "tool-flip", "tool-straighten", "tool-canvassize", "tool-move", "tool-transform"],
  },
  { id: "develop-tools", title: "Develop and effects tools", ids: ["tool-basic-develop", "tool-develop", "tool-adjust", "tool-effects"] },
  {
    id: "retouch-tools",
    title: "Retouching tools",
    ids: [
      "tool-brush", "tool-eraser", "tool-clonestamp", "tool-healingbrush", "tool-spothealing", "tool-patch", "tool-blurbrush",
      "tool-sharpenbrush", "tool-smudge", "tool-dodge", "tool-burn", "tool-sponge", "tool-colourreplacement", "tool-redeyeremoval",
      "tool-liquify",
    ],
  },
  { id: "file-tools", title: "Layers and file tools", ids: ["tool-layers", "tool-text", "tool-files", "tool-export", "tool-metadata", "tool-batch"] },
  {
    id: "filters",
    title: "Filters",
    ids: [
      "filter-develop", "filter-adjust", "filter-gaussian-blur", "filter-sharpen", "filter-blur", "filter-sharpness", "filter-artistic",
      "filter-vintage", "filter-light", "filter-distortion", "filter-pixel", "filter-noise", "filter-stylisation", "filter-grading",
    ],
  },
];
/** Inside "Geometry tools", "Crop" is enough; the page keeps its full title. */
const directoryLabel = (title: string) => title.replace(/ (tool|filters?|kit)$/i, "");

/** A route's placeholder while its code loads, so the shell and toolbar never move. */
function RouteLoading() {
  return (
    <div
      className="docs-route-loading"
      role="status"
      aria-label="Loading the page"
    >
      <Skeleton.Text type="display" width="45%" />
      <Skeleton.Text lines={3} />
      <Skeleton.Block className="docs-route-loading-block" radius="surface" />
    </div>
  );
}

// An application picks one glass rendering in configureAppearance. The documentation lets a
// visitor try both, so it keeps their choice under its own key and configures again on change.
const RENDERING_KEY = "glass-ux-image.docs.glass-rendering";
const storedRendering = (): GlassRendering => {
  try {
    return localStorage.getItem(RENDERING_KEY) === "baked" ? "baked" : "live";
  } catch {
    return "live";
  }
};
configureAppearance({
  defaults: {
    palette: "ocean",
    style: import.meta.env.VITE_GLASS_UX_STYLE === "flat" ? "flat" : "glass",
  },
  glassRendering: storedRendering(),
});

const renderingListeners = new Set<() => void>();
function setGlassRendering(glassRendering: GlassRendering) {
  try {
    localStorage.setItem(RENDERING_KEY, glassRendering);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  configureAppearance({ ...appearanceConfig(), glassRendering });
  // What applyAppearance and the boot script set from the configuration.
  if (glassRendering === "baked")
    document.documentElement.dataset.glassRendering = "baked";
  else delete document.documentElement.dataset.glassRendering;
  for (const listener of renderingListeners) listener();
}
function useGlassRendering(): GlassRendering {
  return useSyncExternalStore(
    (listener) => {
      renderingListeners.add(listener);
      return () => renderingListeners.delete(listener);
    },
    () => appearanceConfig().glassRendering,
    () => "live",
  );
}
const RENDERING_OPTIONS: Array<{ value: GlassRendering; label: string }> = [
  { value: "live", label: "Live" },
  { value: "baked", label: "Baked" },
];

function RepositoryLink() {
  if (!site.repositoryUrl) return null;
  return (
    <ButtonLink
      href={site.repositoryUrl}
      target="_blank"
      rel="noopener noreferrer"
      variant="ghost"
      size="sm"
      className="docs-repository-link"
      icon={<IconGithub />}
      aria-label={`${site.title} on GitHub`}
      title="GitHub repository"
    >
      {null}
    </ButtonLink>
  );
}

/** A directory group: remembered while browsing, an open group of matches while searching. */
function DirectoryGroup({
  id,
  title,
  count,
  searching,
  children,
}: {
  id: string;
  title: string;
  count: number;
  searching: boolean;
  children: ReactNode;
}) {
  return (
    <Sidebar.Group id={id} collapsible={!searching}>
      <Sidebar.GroupLabel count={searching ? undefined : count}>
        {title}
      </Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>{children}</Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}

/** One destination: its label with the search's matches marked, and the route's link. */
function DirectoryLink({
  label,
  query,
  active = false,
  icon,
  link,
  onClick,
}: {
  label: string;
  query: string;
  active?: boolean;
  icon?: ReactNode;
  link: ReactElement;
  onClick: () => void;
}) {
  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        icon={icon}
        active={active}
        render={link}
        onClick={onClick}
      >
        <Sidebar.Match text={label} query={query} />
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  );
}

/** The expanded controls' size: md in the phone sheet, sm in the desktop popover. */
const ChoiceSize = createContext<"sm" | "md">("md");

function AppearanceChoices<V extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
}: {
  label: string;
  value: V;
  options: Array<{ value: V; label: string; icon?: ReactNode }>;
  onValueChange: (value: V) => void;
  disabled?: boolean;
}) {
  const size = use(ChoiceSize);
  return (
    <div className="docs-appearance-control">
      <span className="type-label">{label}</span>
      <div className="docs-appearance-options" role="group" aria-label={label}>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? "soft" : "secondary"}
            size={size}
            icon={option.icon}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The components' interface language; the docs' own prose stays English. */
function LanguageSelect() {
  const { language } = useDocsLanguage();
  return (
    <Select<DocsLanguage>
      size="sm"
      className="docs-language-select"
      aria-label="Interface language"
      value={language}
      onValueChange={(next) => {
        if (next) void setDocsLanguage(next);
      }}
      options={LANGUAGES.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
    />
  );
}

function LanguageChoices() {
  const { language } = useDocsLanguage();
  return (
    <AppearanceChoices<DocsLanguage>
      label="Interface language"
      value={language}
      onValueChange={(next) => void setDocsLanguage(next)}
      options={LANGUAGES.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
    />
  );
}

function Toolbar({ expanded = false }: { expanded?: boolean }) {
  const { appearance, update } = useAppearance();
  const rendering = useGlassRendering();
  const choiceSize = use(ChoiceSize);
  const flat = appearance.style === "flat";
  if (expanded)
    return (
      <div
        className="docs-toolbar"
        data-expanded=""
        role="region"
        aria-label="Appearance controls"
      >
        <AppearanceChoices<VisualStyle>
          label="Visual style"
          value={appearance.style ?? "glass"}
          onValueChange={(style) => update({ style })}
          options={[
            { value: "flat", label: "Flat" },
            { value: "glass", label: "Glass" },
          ]}
        />
        <AppearanceChoices<Appearance["mode"]>
          label="Mode"
          value={appearance.mode}
          onValueChange={(mode) => update({ mode })}
          options={[
            { value: "light", label: "Light", icon: <IconSun /> },
            { value: "dark", label: "Dark", icon: <IconMoon /> },
            { value: "system", label: "Match system", icon: <IconSystem /> },
          ]}
        />
        <div className="docs-appearance-control">
          <span className="type-label">Palette</span>
          <SwatchPicker
            aria-label="Palette"
            size={choiceSize}
            collapse="none"
            value={appearance.palette}
            onValueChange={(palette) => update({ palette, accentHue: null })}
            options={PALETTES.map((palette) => ({
              value: palette,
              label: PALETTE_LABELS[palette] ?? palette,
              palette,
            }))}
          />
        </div>
        <AppearanceChoices<Appearance["glass"]>
          label="Material"
          value={flat ? "solid" : appearance.glass}
          disabled={flat}
          onValueChange={(glass) => update({ glass })}
          options={[
            { value: "full", label: "Glass" },
            { value: "reduced", label: "Frosted" },
            { value: "solid", label: "Solid" },
          ]}
        />
        <AppearanceChoices<GlassRendering>
          label="Blur"
          value={rendering}
          disabled={flat}
          onValueChange={setGlassRendering}
          options={RENDERING_OPTIONS}
        />
        <AppearanceChoices<"full" | "reduced">
          label="Animations"
          value={flat || appearance.motion === "reduced" ? "reduced" : "full"}
          disabled={flat}
          onValueChange={(motion) => update({ motion })}
          options={[
            { value: "full", label: "Animated" },
            { value: "reduced", label: "Still" },
          ]}
        />
        <AppearanceChoices<Appearance["density"]>
          label="Density"
          value={appearance.density}
          onValueChange={(density) => update({ density })}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <AppearanceChoices<NonNullable<Appearance["background"]>>
          label="Background"
          value={flat ? "plain" : (appearance.background ?? "silk")}
          disabled={flat}
          onValueChange={(background) => update({ background })}
          options={BACKGROUNDS.map((value) => ({
            value,
            label: BACKGROUND_LABELS[value] ?? value,
          }))}
        />
        <LanguageChoices />
      </div>
    );
  // One line that gives way in order (fa-fit-row): the palette folds to a menu first (its
  // twelve swatches are the widest control), then blur, density, animations and material;
  // the background select truncates last; the mode switch keeps its icons.
  return (
    <div
      className="docs-toolbar fa-fit-row"
      role="region"
      aria-label="Appearance controls"
    >
      <Segmented
        size="sm"
        iconOnly
        aria-label="Mode"
        value={appearance.mode}
        onValueChange={(mode) => update({ mode })}
        options={[
          { value: "light", label: "Light", icon: <IconSun /> },
          { value: "dark", label: "Dark", icon: <IconMoon /> },
          { value: "system", label: "Match system", icon: <IconSystem /> },
        ]}
      />
      <SwatchPicker
        size="sm"
        className="fa-fit-0"
        aria-label="Palette"
        value={appearance.palette}
        onValueChange={(palette) => update({ palette, accentHue: null })}
        options={PALETTES.map((palette) => ({
          value: palette,
          label: PALETTE_LABELS[palette] ?? palette,
          palette,
        }))}
      />
      <Segmented
        size="sm"
        className="fa-fit-4 docs-glass-only"
        aria-label="Material"
        value={flat ? "solid" : appearance.glass}
        disabled={flat}
        onValueChange={(glass) => update({ glass })}
        options={[
          { value: "full", label: "Glass" },
          { value: "reduced", label: "Frosted" },
          { value: "solid", label: "Solid" },
        ]}
      />
      <Segmented
        size="sm"
        className="fa-fit-1 docs-glass-only"
        aria-label="Blur"
        value={rendering}
        disabled={flat}
        onValueChange={setGlassRendering}
        options={RENDERING_OPTIONS}
      />
      <Segmented
        size="sm"
        className="fa-fit-3 docs-glass-only"
        aria-label="Animations"
        value={flat || appearance.motion === "reduced" ? "reduced" : "full"}
        disabled={flat}
        onValueChange={(motion) => update({ motion })}
        options={[
          { value: "full", label: "Animated" },
          { value: "reduced", label: "Still" },
        ]}
      />
      <Segmented
        size="sm"
        className="fa-fit-2"
        aria-label="Density"
        value={appearance.density}
        onValueChange={(density) => update({ density })}
        options={[
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" },
        ]}
      />
      <Select
        size="sm"
        className="docs-background-select fa-fit-5 docs-glass-only"
        aria-label="Background"
        value={flat ? "plain" : (appearance.background ?? "silk")}
        disabled={flat}
        onValueChange={(background) => {
          if (background) update({ background });
        }}
        options={BACKGROUNDS.map((value) => ({
          value,
          label: BACKGROUND_LABELS[value] ?? value,
        }))}
      />
    </div>
  );
}
/**
 * The desktop header's appearance controls: the toolbar while its folded controls fit
 * (a container query on this box), else one Appearance button whose popover holds them.
 */
function HeaderAppearance() {
  return (
    <div className="docs-header-appearance">
      <Toolbar />
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              icon={<IconSettings />}
              className="docs-appearance-button"
            >
              Appearance
            </Button>
          }
        />
        <Popover.Popup
          align="end"
          size="lg"
          className="docs-appearance-popover"
        >
          <ChoiceSize value="sm">
            <Toolbar expanded />
          </ChoiceSize>
        </Popover.Popup>
      </Popover.Root>
    </div>
  );
}

function VisualStyleSwitch() {
  const { appearance, update } = useAppearance();
  return (
    <Segmented<VisualStyle>
      size="sm"
      className="docs-style-switch"
      aria-label="Visual style"
      value={appearance.style ?? "glass"}
      onValueChange={(style) => update({ style })}
      options={[
        { value: "flat", label: "Flat" },
        { value: "glass", label: "Glass" },
      ]}
    />
  );
}

function Providers() {
  return (
    <DocsKitProvider site={site}>
      <AppearanceProvider>
        <TooltipProvider>
          <ActionProvider>
            <PaletteProvider>
              <Outlet />
            </PaletteProvider>
          </ActionProvider>
        </TooltipProvider>
      </AppearanceProvider>
    </DocsKitProvider>
  );
}

function Layout() {
  return (
    <SidebarProvider storageKey="glass-ux-image.docs.sidebar" className="gallery-shell docs-layout">
      <DocsFrame />
    </SidebarProvider>
  );
}

/** The directory in a Sidebar (a sheet on phones) beside the routed page. */
function DocsFrame() {
  const [query, setQuery] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const appearanceButton = useRef<HTMLButtonElement>(null);
  const { appearance } = useAppearance();
  const { isMobile: phone, openMobile, setOpenMobile } = useSidebar();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activePath = pathname.startsWith(import.meta.env.BASE_URL)
    ? `/${pathname.slice(import.meta.env.BASE_URL.length)}`
    : pathname;
  const search = query.trim().toLowerCase();
  const matches = (...text: string[]) =>
    text.join(" ").toLowerCase().includes(search);
  const items = runtime.families.all.filter((item) =>
    item.components.some((component) =>
      matches(component.name, component.description, component.id),
    ),
  );
  const guides = site.guides.filter((guide) =>
    matches(guide.title, guide.id, "Guides"),
  );
  const sectionItems = SECTION_GROUPS.map((group) => ({
    ...group,
    sections: group.ids.flatMap((id) => {
      const section = foundations.find((item) => item.id === id);
      return section && matches(section.title, section.summary, section.id, group.title) ? [section] : [];
    }),
  }));
  const templateItems = templates.filter((t) => matches(t.title, t.summary, "Templates"));
  const showTypes = matches("Types and helpers", "TypeDoc", "API reference");
  const empty =
    !items.length &&
    !guides.length &&
    !templateItems.length &&
    sectionItems.every((group) => !group.sections.length) &&
    !showTypes;
  const searching = Boolean(search);
  const marked = query.trim();
  // Choosing a destination clears the search; the phone sheet closes itself.
  const activate = () => setQuery("");
  const SectionGroup = ({ group }: { group: (typeof sectionItems)[number] }) =>
    group.sections.length ? (
      <DirectoryGroup id={group.id} title={group.title} count={group.sections.length} searching={searching}>
        {group.sections.map((section) => (
          <DirectoryLink
            key={section.id}
            label={directoryLabel(section.title)}
            query={marked}
            active={activePath === `/foundations/${section.id}`}
            onClick={activate}
            link={<Link to="/foundations/$section" params={{ section: section.id }} />}
          />
        ))}
      </DirectoryGroup>
    ) : null;
  return (
    <>
      {phone ? (
        <header className="docs-mobile-header">
          <Link to="/" className="gallery-brand" onClick={activate}>
            <span className="gallery-brand-name">{site.title}</span>
          </Link>
          <div className="docs-mobile-actions">
            <RepositoryLink />
            <Button
              variant="ghost"
              icon={<IconSidebar />}
              aria-label="Browse"
              aria-expanded={openMobile}
              aria-haspopup="dialog"
              onClick={() => setOpenMobile(true)}
            >
              <span className="docs-mobile-action-label">Browse</span>
            </Button>
            <Button
              ref={appearanceButton}
              variant="ghost"
              icon={<IconSettings />}
              aria-label="Appearance"
              aria-expanded={appearanceOpen}
              aria-haspopup="dialog"
              onClick={() => setAppearanceOpen(true)}
            >
              <span className="docs-mobile-action-label">Appearance</span>
            </Button>
          </div>
        </header>
      ) : null}
      <Sidebar
        className="docs-sidebar"
        variant={appearance.style === "flat" ? "sidebar" : "floating"}
        resizable
        aria-label="Documentation navigation"
      >
        <Sidebar.Header
          title={
            <Link to="/" onClick={activate}>
              {site.title}
            </Link>
          }
          subtitle={`v${site.version}`}
          // The page header's trigger toggles the docked sidebar; the sheet keeps its close button.
          toggle={phone}
        />
        <Sidebar.Search
          aria-label="Search documentation"
          placeholder="Search"
          value={query}
          onValueChange={setQuery}
        />
        <Sidebar.Content className="docs-directory">
          {empty ? (
            <p
              role="status"
              className="type-caption text-fg-muted docs-directory-empty"
            >
              No documentation matches “{marked}”.
            </p>
          ) : null}
          {guides.length ? (
            <DirectoryGroup id="guides" title="Guides" count={guides.length} searching={searching}>
              {guides.map((guide) => (
                <DirectoryLink
                  key={guide.id}
                  label={guide.title}
                  query={marked}
                  active={activePath === `/guides/${guide.id}`}
                  onClick={activate}
                  link={<Link to="/guides/$guide" params={{ guide: guide.id }} />}
                />
              ))}
            </DirectoryGroup>
          ) : null}
          {templateItems.length ? (
            <DirectoryGroup id="templates" title="Templates" count={templateItems.length} searching={searching}>
              {templateItems.map((t) => (
                <DirectoryLink
                  key={t.id}
                  label={t.title}
                  query={marked}
                  onClick={activate}
                  active={activePath === `/templates/${t.id}`}
                  link={<Link to="/templates/$template" params={{ template: t.id }} />}
                />
              ))}
            </DirectoryGroup>
          ) : null}
          {sectionItems.slice(0, 1).map((group) => (
            <SectionGroup key={group.id} group={group} />
          ))}
          {COMPONENT_GROUPS.map((group) => {
            const order = group.families as readonly string[];
            const entries = items
              .filter((item) => componentGroup(item.family) === group.id)
              .sort((a, b) => (order.indexOf(a.family) + 1 || order.length + 1) - (order.indexOf(b.family) + 1 || order.length + 1));
            return entries.length ? (
              <DirectoryGroup key={group.id} id={group.id} title={group.title} count={entries.length} searching={searching}>
                {entries.map((item) => (
                  <DirectoryLink
                    key={item.id}
                    label={item.name}
                    query={marked}
                    active={item.components.some((component) => activePath === `/components/${component.id}`)}
                    onClick={activate}
                    link={<Link to="/components/$component" params={{ component: item.id }} />}
                  />
                ))}
              </DirectoryGroup>
            ) : null;
          })}
          {sectionItems.slice(1).map((group) => (
            <SectionGroup key={group.id} group={group} />
          ))}
        </Sidebar.Content>
        <Sidebar.Footer>
          {showTypes ? (
            <Sidebar.Menu>
              <DirectoryLink
                icon={<IconCode />}
                label="API reference"
                query=""
                onClick={activate}
                link={<a href={`${import.meta.env.BASE_URL}api/`} />}
              />
            </Sidebar.Menu>
          ) : null}
          <div className="docs-language">
            <LanguageSelect />
          </div>
        </Sidebar.Footer>
        <Sidebar.Rail />
      </Sidebar>
      <SidebarInset
        className="gallery-main docs-main"
        tabIndex={0}
        aria-label="Documentation"
      >
        {!phone ? (
          <header className="gallery-header docs-header">
            <SidebarTrigger className="docs-sidebar-trigger" />
            <VisualStyleSwitch />
            <RepositoryLink />
            <HeaderAppearance />
          </header>
        ) : null}
        <div
          className="gallery-content docs-content"
          data-scroll-container
          tabIndex={0}
          role="region"
          aria-label="Documentation content"
        >
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
      {phone ? (
        <Dialog.Root open={appearanceOpen} onOpenChange={setAppearanceOpen}>
          <Dialog.Popup
            className="docs-mobile-dialog docs-appearance-dialog"
            finalFocus={appearanceButton}
          >
            <Dialog.Header role="presentation" title="Appearance" />
            <Dialog.Body>
              <Toolbar expanded />
            </Dialog.Body>
          </Dialog.Popup>
        </Dialog.Root>
      ) : null}
    </>
  );
}

const rootRoute = createRootRoute({ component: Providers });
const docsRoute = createRoute({ getParentRoute: () => rootRoute, id: "docs", component: Layout });
const indexRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: "/",
  component: Home,
});
const componentRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: "/components/$component",
  component: () => {
    const { component } = componentRoute.useParams();
    return <ComponentDocumentation key={component} id={component} />;
  },
});
// The shared Markdown renderer treats web links as external and rejects private hosts.
// Its document-anchor path keeps local guide links intact; resolve our markers after render.
function LocalGuide({ id }: { id: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = element.current!;
    const localise = () => {
      for (const anchor of root.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href");
        if (href?.startsWith("#docs-guide-")) {
          anchor.setAttribute(
            "href",
            new URL(
              `${import.meta.env.BASE_URL}guides/${decodeURIComponent(href.slice(12))}`,
              location.origin,
            ).href,
          );
        }
        if (
          new URL((anchor as HTMLAnchorElement).href).origin !== location.origin
        )
          continue;
        anchor.removeAttribute("target");
        anchor.querySelector(".fa-ai-link-external")?.remove();
      }
    };
    const observer = new MutationObserver(localise);
    observer.observe(root, { childList: true, subtree: true });
    localise();
    return () => observer.disconnect();
  }, [id]);
  return (
    <div ref={element}>
      <LibraryGuide id={id} />
    </div>
  );
}
const guideRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: "/guides/$guide",
  component: () => {
    const { guide } = guideRoute.useParams();
    return <LocalGuide key={guide} id={guide} />;
  },
});
const foundationRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: "/foundations/$section",
  component: () => {
    const { section } = foundationRoute.useParams();
    return <FoundationDocumentation key={section} id={section} />;
  },
});
const templateIndexRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: "/templates",
  component: TemplateIndex,
});
const templateRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: "/templates/$template",
  component: () => {
    const { template } = templateRoute.useParams();
    return <TemplatePage key={template} id={template} />;
  },
});
// A screen on its own, filling the window, without the documentation around it.
const templatePreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/templates/$template/preview",
  component: () => {
    const { template } = templatePreviewRoute.useParams();
    return (
      <Suspense fallback={<RouteLoading />}>
        <TemplatePreview
          key={template}
          id={template}
          back={
            <ButtonLink
              variant="ghost"
              size="sm"
              icon={<IconArrowLeft />}
              render={<Link to="/templates/$template" params={{ template }} />}
            >
              Back to the template
            </ButtonLink>
          }
        />
      </Suspense>
    );
  },
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    docsRoute.addChildren([
      indexRoute,
      componentRoute,
      guideRoute,
      foundationRoute,
      templateIndexRoute,
      templateRoute,
    ]),
    templatePreviewRoute,
  ]),
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
});
// The interface language: remembered, or previewed with ?lang=ar&dir=rtl for one visit.
restoreDocsLanguage();
createRoot(document.getElementById("root")!).render(
  <DocsDirection>
    <RouterProvider router={router} />
  </DocsDirection>,
);
