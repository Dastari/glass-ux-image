import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppearanceProvider, configureAppearance } from "glass-ux/appearance";
import { registerMessagePack } from "glass-ux/i18n";
import gluxAr from "glass-ux/i18n/ar";
import { configureLocale, DirectionProvider } from "glass-ux/locale";
import { useMessages } from "glass-ux/i18n";
import { workspaceMessages } from "glass-ux-image/messages/workspace";
import { WorkspacePage } from "./workspace-page";
import { TemplatesPage } from "./templates-page";
import { Segmented } from "glass-ux/segmented";
import { TooltipProvider } from "glass-ux/tooltip";
import imageAr from "glass-ux-image/i18n/ar";
import { CustomPage } from "./custom-page";
import { EditorPage } from "./editor-page";
import { FilesFixture } from "./domains/files";
import { EnginePage } from "./engine-page";
import "glass-ux-image/styles.css";
import "./styles.css";

configureAppearance({ defaults: { mode: new URLSearchParams(location.search).get("mode")==="light"?"light":"dark", palette:"graphite" } });

const params = new URLSearchParams(location.search);
const direction = params.get("dir") === "rtl" ? "rtl" : "ltr";
document.documentElement.dir = direction;
// Glass UX through Tailwind v4 (still so in 0.15) matches right-to-left styling by language, not by `dir`, in production
// builds, so a right-to-left page must also be in a right-to-left language. Arabic is the demo's one.
if (params.get("lang") === "ar" || direction === "rtl") {
  registerMessagePack({locale:"ar",messages:{...gluxAr.messages,...imageAr.messages}});
  document.documentElement.lang = "ar";
  configureLocale("ar");
}

type View = "workspace" | "editor" | "custom" | "engine" | "templates";

function App() {
  if(params.has("files-test"))return <FilesFixture />;
  const m=useMessages(workspaceMessages);
  const [view, setView] = useState<View>(() => (params.get("view") as View | null) ?? (params.has("kit")||params.has("format")||params.has("layers-test")?"editor":"workspace"));
  return (
    <div className="shell" data-density="compact">
      <nav className="shell-nav" aria-label={m.demo}>
        <Segmented size="sm" aria-label={m.demo} value={view} onValueChange={setView} collapse="menu" options={[{value:"workspace",label:m.workspace},{ value: "editor", label: m.photo }, { value: "custom", label: m.custom }, { value: "engine", label: m.engine },{value:"templates",label:m.templates}]} />
      </nav>
      {view==="workspace"?<WorkspacePage/>:view==="templates"?<TemplatesPage/>:view === "editor" ? <EditorPage /> : view === "custom" ? <div className="custom-page"><CustomPage /></div> : <EnginePage />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppearanceProvider>
    <DirectionProvider direction={direction}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </DirectionProvider>
  </AppearanceProvider>,
);
