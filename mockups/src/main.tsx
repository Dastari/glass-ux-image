import { createRoot } from "react-dom/client";
import { AppearanceProvider, configureAppearance } from "glass-ux/appearance";
import { configureLocale, DirectionProvider } from "glass-ux/locale";
import { TooltipProvider } from "glass-ux/tooltip";
import "./styles.css";
import { createScene } from "./scene";
import { Adjust, Docked, Export, Filters, Focus, HostWindow, Open, PhoneEdit, PhoneLayers, Pieces } from "./screens";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "light" ? "light" : "dark";
const palette = params.get("palette") ?? "graphite";
const html = document.documentElement;
html.dataset.mode = mode;
html.dataset.palette = palette;
const direction = params.get("dir") === "rtl" ? "rtl" : "ltr";
html.dir = direction;
if (params.get("lang") === "ar") {
  html.lang = "ar";
  configureLocale("ar");
}
configureAppearance({ defaults: { mode, palette, background: "silk" } as never });

const SCREENS = { window: HostWindow, docked: Docked, focus: Focus, adjust: Adjust, filters: Filters, export: Export, open: Open, pieces: Pieces, "phone-edit": PhoneEdit, "phone-layers": PhoneLayers };
const name = (params.get("s") ?? "docked") as keyof typeof SCREENS;
const Screen = SCREENS[name] ?? Docked;
const scene = createScene();

createRoot(document.getElementById("root")!).render(
  <AppearanceProvider>
    <DirectionProvider direction={direction}>
      <TooltipProvider>
        <Screen scene={scene} />
      </TooltipProvider>
    </DirectionProvider>
  </AppearanceProvider>,
);
