import { useState, type ReactNode } from "react";
import { Badge } from "glass-ux/badge";
import { Button } from "glass-ux/button";
import { ColorPicker } from "glass-ux/color-picker";
import { FileDrop } from "glass-ux/file-drop";
import { Field } from "glass-ux/field";
import { Input } from "glass-ux/input";
import { Notice } from "glass-ux/notice";
import { NumberField } from "glass-ux/number-field";
import { Progress } from "glass-ux/progress";
import { Segmented } from "glass-ux/segmented";
import { Select } from "glass-ux/select";
import { Slider } from "glass-ux/slider";
import { Surface, Panel, PanelHeader } from "glass-ux/surface";
import { Switch } from "glass-ux/switch";
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconClipboard, IconClock, IconCloud, IconClose, IconColumns, IconDatabase, IconDesktop, IconFolderOpen, IconLayers, IconLink, IconMoreHorizontal, IconPalette, IconPlus, IconRedo, IconUndo, IconZoomIn } from "glass-ux/icons";
import { Ti } from "./icons";
import { BLEND, BrushOptions, CurvesGraph, Histogram, HistogramPanel, LayerRow, LayersPanel, Selection, Stage, ToolRail, TopBar, layerRows } from "./workspace";
import { t } from "./i18n";
import type { Scene } from "./scene";

const GRADE = "contrast(1.14) saturate(1.2) brightness(1.03)";

export function Docked({ scene }: { scene: Scene }) {
  return (
    <div className="ws" data-density="compact">
      <TopBar options={<BrushOptions />} />
      <ToolRail />
      <Stage scene={scene}>
        <Selection />
        <span className="guide" style={{ insetBlock: 0, insetInlineStart: "33.3%", inlineSize: 1 }} />
        <span className="guide" style={{ insetInline: 0, insetBlockStart: "66.5%", blockSize: 1 }} />
        <span className="cursor" style={{ left: "66%", top: "26%", width: 44, height: 44 }} />
      </Stage>
      <div className="ws-side">
        <HistogramPanel scene={scene} />
        <Panel>
          <PanelHeader level={3} title={t("Colour")} />
          <div className="pane-body"><ColorPicker aria-label="Foreground colour" defaultValue="#e8875a" /></div>
        </Panel>
        <LayersPanel scene={scene} />
      </div>
    </div>
  );
}

export function Focus({ scene }: { scene: Scene }) {
  return (
    <div className="fx" data-mode="dark" data-density="compact">
      <img src={scene.url} alt="" />
      <div className="fx-top">
        <Surface material="float" className="fx-pill">
          <Button variant="ghost" size="sm" icon={<IconArrowLeft />} aria-label="Back" tooltip={false} />
          <span style={{ fontSize: "var(--type-label-size)" }}>lake-at-dusk</span>
          <Badge tone="neutral" size="sm">62%</Badge>
          <Button variant="ghost" size="sm" icon={<IconUndo />} aria-label="Undo" tooltip={false} />
          <Button variant="ghost" size="sm" icon={<IconRedo />} aria-label="Redo" tooltip={false} />
        </Surface>
        <Surface material="float" className="fx-pill">
          <Button variant="ghost" size="sm" icon={<IconLayers />} aria-label="Layers" tooltip={false} />
          <Button variant="ghost" size="sm" icon={<Ti n="adjust" />} aria-label="Adjust" tooltip={false} />
          <Button variant="primary" size="sm">Export</Button>
        </Surface>
      </div>
      <div className="fx-side">
        <Panel glass="glass">
          <PanelHeader level={3} title="Adjust" />
          <div className="pane-body" style={{ display: "grid", gap: "var(--space-2-5)" }}>
            {([["Exposure", "+0.35", 60], ["Contrast", "+12", 56], ["Highlights", "−28", 36], ["Shadows", "+18", 59], ["Temperature", "+6", 53], ["Vibrance", "+22", 61]] as const).map(([n, v, p]) => (
              <div className="param" key={n}><div><span>{n}</span><b>{v}</b></div><Slider aria-label={n} defaultValue={p} size="sm" bubble="never" /></div>
            ))}
          </div>
        </Panel>
      </div>
      <Surface material="float" className="fx-dock" role="toolbar" aria-label="Tools">
        {["move", "marquee", "lasso", "crop"].map((n) => <button key={n} className="tool" aria-label={n} type="button"><Ti n={n} /></button>)}
        <span className="ws-rule" style={{ inlineSize: 0, blockSize: "1.25rem", borderInlineStart: "var(--divider)", borderBlockStart: 0, marginInline: "var(--space-1)" }} />
        {["brush", "eraser", "fill", "clone", "heal", "text", "shape"].map((n) => <button key={n} className="tool" aria-label={n} data-active={n === "heal" ? "" : undefined} type="button"><Ti n={n} /></button>)}
        <span className="ws-rule" style={{ inlineSize: 0, blockSize: "1.25rem", borderInlineStart: "var(--divider)", borderBlockStart: 0, marginInline: "var(--space-1)" }} />
        <button className="tool" aria-label="Zoom" type="button"><IconZoomIn /></button>
      </Surface>
    </div>
  );
}

export function Adjust({ scene }: { scene: Scene }) {
  return (
    <div className="ws" data-density="compact">
      <TopBar options={<>
        <span className="tool" style={{ color: "var(--fg)" }}><Ti n="curves" /></span>
        <span style={{ fontSize: "var(--type-label-size)" }}>Curves</span>
        <span className="mx-tick">adjustment layer on Retouch</span>
        <span className="ws-grow" />
        <Segmented size="sm" aria-label="Compare" defaultValue="split" collapse="none" options={[{ value: "off", label: "Result" }, { value: "split", label: "Split" }, { value: "side", label: "Side by side" }]} />
      </>} />
      <ToolRail active="" />
      <Stage scene={scene} zoom="48.2%">
        <div className="split">
          <div className="split-after"><img src={scene.url} alt="" style={{ filter: GRADE }} /></div>
          <span className="split-line" />
          <span className="split-knob"><IconColumns /></span>
          <span className="split-tag" style={{ left: 8 }}>After</span>
          <span className="split-tag" style={{ right: 8 }}>Before</span>
        </div>
      </Stage>
      <div className="ws-side">
        <Panel style={{ flex: "1 1 auto" }}>
          <PanelHeader level={3} title="Curves" actions={<Button variant="ghost" size="xs" icon={<IconMoreHorizontal />} aria-label="Curves options" tooltip={false} />} />
          <div className="pane-body" style={{ display: "grid", gap: "var(--space-3)" }}>
            <Select aria-label="Preset" size="sm" defaultValue="soft" options={[{ value: "soft", label: "Soft contrast" }, { value: "linear", label: "Linear" }, { value: "film", label: "Faded film" }]} />
            <Segmented size="sm" block aria-label="Channel" defaultValue="rgb" collapse="none" options={[{ value: "rgb", label: "RGB" }, { value: "r", label: "Red" }, { value: "g", label: "Green" }, { value: "b", label: "Blue" }]} />
            <CurvesGraph scene={scene} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
              <NumberField aria-label="Input" size="sm" defaultValue={174} min={0} max={255} unit="in" />
              <NumberField aria-label="Output" size="sm" defaultValue={201} min={0} max={255} unit="out" />
            </div>
            <div className="param"><div><span>Opacity</span><b>100%</b></div><Slider aria-label="Opacity" defaultValue={100} size="sm" bubble="never" /></div>
            <Select aria-label="Blend mode" size="sm" options={BLEND} defaultValue="Normal" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

const CATS: Array<[string, number]> = [["Blur", 9], ["Sharpen", 5], ["Noise", 6], ["Distort", 14], ["Light and shadow", 11], ["Stylise", 12], ["Artistic", 10], ["Colour", 16], ["Edge detect", 5], ["Render", 8], ["Generic", 4]];
const FILTERS: Array<[string, string]> = [["Gaussian blur", "blur(3px)"], ["Motion blur", "blur(2px) brightness(1.04)"], ["Radial blur", "blur(2.5px) saturate(1.1)"], ["Lens blur", "blur(1.5px) contrast(1.1)"], ["Tilt shift", "saturate(1.25)"], ["Surface blur", "blur(1px)"], ["Bilateral", "contrast(.96) saturate(1.05)"], ["Median", "blur(.8px) contrast(1.05)"], ["Pixelate", "pixel"]];

export function Filters({ scene }: { scene: Scene }) {
  return (
    <div className="scrimmed"><Docked scene={scene} /><div className="scrim">
      <Surface material="overlay" radius="dialog" className="dlg fg" role="dialog" aria-label="Filter gallery">
        <div className="dlg-head" style={{ gridArea: "head" }}>
          <span style={{ font: "var(--type-subtitle-weight) var(--type-subtitle-size) var(--font-sans)" }}>Filters</span>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <Badge tone="neutral" size="sm">100 filters · GPU</Badge>
            <Button variant="ghost" size="sm" icon={<IconClose />} aria-label="Close" tooltip={false} />
          </div>
        </div>
        <div className="fg-cats">{CATS.map(([c, n]) => <div className="fg-cat" key={c} data-active={c === "Blur" ? "" : undefined}><span>{c}</span><span className="mx-num">{n}</span></div>)}</div>
        <div className="fg-grid">{FILTERS.map(([n, f]) => <div key={n} className="fg-item" data-active={n === "Lens blur" ? "" : undefined}><img src={f === "pixel" ? scene.tiny : scene.url} alt="" style={f === "pixel" ? { imageRendering: "pixelated" } : { filter: f }} /><span>{n}</span></div>)}</div>
        <div className="fg-side">
          <img src={scene.url} alt="Filter preview" style={{ filter: "blur(1.5px) contrast(1.1)" }} />
          {([["Radius", "18 px", 36], ["Bokeh brightness", "1.4", 58], ["Bokeh threshold", "0.72", 72], ["Roundness", "86%", 86]] as const).map(([n, v, p]) => (
            <div className="param" key={n}><div><span>{n}</span><b>{v}</b></div><Slider aria-label={n} defaultValue={p} size="sm" bubble="never" /></div>
          ))}
          <Select aria-label="Aperture" size="sm" defaultValue="hex" options={[{ value: "hex", label: "Hexagon aperture" }, { value: "circle", label: "Circle aperture" }]} />
          <Switch label="Apply as non-destructive layer" defaultChecked size="sm" />
        </div>
        <div className="dlg-foot" style={{ gridArea: "foot" }}><span className="mx-tick" style={{ marginInlineEnd: "auto" }}>Preview 16 ms · Full image about 180 ms</span><Button variant="secondary" size="sm">Cancel</Button><Button variant="primary" size="sm">Apply</Button></div>
      </Surface>
    </div></div>
  );
}

export function Export({ scene }: { scene: Scene }) {
  return (
    <div className="scrimmed"><Docked scene={scene} /><div className="scrim">
      <Surface material="overlay" radius="dialog" className="dlg ex" role="dialog" aria-label="Export image">
        <div className="dlg-head" style={{ gridArea: "head" }}>
          <span style={{ font: "var(--type-subtitle-weight) var(--type-subtitle-size) var(--font-sans)" }}>Export</span>
          <Button variant="ghost" size="sm" icon={<IconClose />} aria-label="Close" tooltip={false} />
        </div>
        <div className="ex-view" data-mode="dark" dir="ltr">
          <img src={scene.url} alt="Export preview at 100%" style={{ objectPosition: "62% 40%", scale: 1.3 }} />
          <span className="split-tag" style={{ left: 12, top: 4 }}>100% · quality 82</span>
        </div>
        <div className="ex-side">
          <Field label="Format"><Segmented block size="sm" defaultValue="webp" collapse="none" aria-label="Format" options={["PNG", "JPEG", "WebP", "AVIF", "TIFF"].map((f) => ({ value: f.toLowerCase(), label: f }))} /></Field>
          <div className="param"><div><span>Quality</span><b>82</b></div><Slider aria-label="Quality" defaultValue={82} size="sm" bubble="never" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "var(--space-2)", alignItems: "center" }}>
            <Field label="Width"><NumberField size="sm" defaultValue={2400} unit="px" aria-label="Width" /></Field>
            <Button variant="ghost" size="sm" icon={<Ti n="link" />} aria-label="Keep proportions" tooltip={false} />
            <Field label="Height"><NumberField size="sm" defaultValue={1600} unit="px" aria-label="Height" /></Field>
          </div>
          <Field label="Colour profile"><Select aria-label="Colour profile" size="sm" defaultValue="p3" options={[{ value: "p3", label: "Display P3 (embed)" }, { value: "srgb", label: "sRGB (convert)" }]} /></Field>
          <Field label="Save to"><Select aria-label="Save to" size="sm" defaultValue="dev" options={[{ value: "dev", label: "This device…" }, { value: "assets", label: "Project assets" }, { value: "share", label: "Team share" }]} /></Field>
          <Switch label="Remove location and camera metadata" defaultChecked size="sm" />
          <div className="kv" style={{ marginBlockStart: "auto" }}><span>Estimated size</span><b>418 KB</b></div>
        </div>
        <div className="dlg-foot" style={{ gridArea: "foot" }}><Button variant="secondary" size="sm">Cancel</Button><Button variant="primary" size="sm">Export</Button></div>
      </Surface>
    </div></div>
  );
}

export function Open({ scene }: { scene: Scene }) {
  const Src = ({ icon, label, active, tag }: { icon: ReactNode; label: string; active?: boolean; tag?: string }) => (
    <div className="op-src" data-active={active ? "" : undefined}>{icon}<span style={{ flex: 1 }}>{label}</span>{tag && <span className="mx-tick">{tag}</span>}</div>
  );
  const Card = ({ name, meta, f, tag }: { name: string; meta: string; f?: string; tag?: ReactNode }) => (
    <Surface material="card" radius="tile" className="op-card">
      <img src={scene.url} alt="" style={{ filter: f }} />
      <div className="op-meta"><b>{name}</b><span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{meta}</span>{tag}</span></div>
    </Surface>
  );
  return (
    <div className="op" data-density="compact">
      <Surface as="nav" aria-label="Sources" material="chrome" padding="none" className="op-nav">
        <Src icon={<IconClock />} label="Recent" active />
        <Src icon={<IconDesktop />} label="This device" />
        <Src icon={<IconLink />} label="From URL" />
        <Src icon={<IconClipboard />} label="Clipboard" />
        <div className="op-group">Connected by the application</div>
        <Src icon={<IconCloud />} label="Project assets" tag="1 204" />
        <Src icon={<IconDatabase />} label="Team share" tag="Read only" />
        <span className="ws-grow" />
        <Button variant="secondary" size="sm" icon={<IconPlus />} block>New image</Button>
      </Surface>
      <main className="op-main">
        <FileDrop onFiles={() => {}} accept="image/*" multiple hint="PNG, JPEG, WebP, AVIF, GIF, BMP, TIFF, PSD, XCF or .guxi" />
        <div className="op-grid">
          <Card name="lake-at-dusk.guxi" meta="6000 × 4000 · 7 layers" tag={<Badge tone="neutral" size="sm" marker="dot">Saved</Badge>} />
          <Card name="harbour-grade.guxi" meta="4200 × 2800 · 12 layers" f="hue-rotate(-30deg) saturate(.8)" tag={<Badge tone="warning" size="sm" marker="dot">Unsaved</Badge>} />
          <Card name="poster-final.png" meta="2480 × 3508 · Project assets" f="grayscale(.6) contrast(1.2)" tag={<IconCloud width={14} height={14} />} />
          <Card name="ridge-study.webp" meta="3000 × 2000 · This device" f="sepia(.5)" />
          <Card name="snowline.tiff" meta="8256 × 5504 · 16-bit" f="brightness(1.1) saturate(.55)" />
          <Card name="crop-test.jpg" meta="1600 × 900 · Project assets" f="saturate(1.7)" tag={<IconCloud width={14} height={14} />} />
          <Card name="board-cover.psd" meta="3840 × 2160 · 31 layers" f="contrast(.8) brightness(.9)" />
          <Card name="headland.avif" meta="5000 × 3333 · This device" f="hue-rotate(40deg)" />
        </div>
        <Notice tone="warning" compact title="poster-final.png changed in Project assets" action={<div style={{ display: "flex", gap: "var(--space-2)" }}><Button variant="secondary" size="sm">Compare</Button><Button variant="secondary" size="sm">Keep both</Button><Button variant="secondary" size="sm">Reload</Button></div>}>Your copy has 3 edits made since it was opened.</Notice>
        <div className="op-new">
          {([["Screen", "1920 × 1080"], ["Square", "2048 × 2048"], ["A4 at 300 ppi", "2480 × 3508"], ["Icon", "512 × 512"], ["Social cover", "1600 × 900"], ["Custom", "Any size"]] as const).map(([n, s]) => (
            <Surface key={n} material="card" radius="tile" className="op-meta" style={{ flex: "1 1 0" }}><b>{n}</b><span className="mx-num">{s}</span></Surface>
          ))}
        </div>
      </main>
    </div>
  );
}

export function Pieces({ scene }: { scene: Scene }) {
  const Card = ({ name, span, children, row }: { name: string; span: number; row?: number; children: ReactNode }) => (
    <Surface material="panel" radius="surface" className="em-card" style={{ gridColumn: `span ${span}`, gridRow: row ? `span ${row}` : undefined }}>
      <div className="em-title"><span>{name}</span></div>
      <div className="em-body">{children}</div>
    </Surface>
  );
  const [pos] = useState(52);
  return (
    <div className="em" data-density="compact">
      <Card name="<ImageField />" span={3}>
        <div className="crop"><img src={scene.url} alt="" style={{ objectPosition: "60% 40%" }} /><span className="crop-box" data-round="" style={{ blockSize: "84%", aspectRatio: 1, insetBlockStart: "8%", left: "50%", translate: "-50% 0" }} /></div>
        <div className="param"><div><span>Zoom</span><b>140%</b></div><Slider aria-label="Zoom" defaultValue={40} size="sm" bubble="never" /></div>
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}><Button variant="secondary" size="sm">Replace</Button><Button variant="primary" size="sm">Use photo</Button></div>
      </Card>
      <Card name="<ImageCropper />" span={5}>
        <div className="crop"><img src={scene.url} alt="" /><span className="crop-box" data-grid="" style={{ inlineSize: "84%", aspectRatio: "16 / 9", top: "50%", left: "50%", translate: "-50% -50%" }} /></div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", justifyContent: "space-between" }}>
          <Segmented size="sm" aria-label="Aspect ratio" defaultValue="169" collapse="none" options={[{ value: "free", label: "Free" }, { value: "11", label: "1:1" }, { value: "169", label: "16:9" }, { value: "43", label: "4:3" }]} />
          <Button variant="ghost" size="sm" icon={<Ti n="rotate" />} aria-label="Rotate" tooltip={false} />
        </div>
      </Card>
      <Card name="<ImageAnnotator />" span={4}>
        <div className="crop">
          <img src={scene.url} alt="" />
          <svg className="ants" viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden="true">
            <rect x="222" y="60" width="118" height="80" rx="8" fill="none" stroke="#ff7a59" strokeWidth="3" />
            <path d="M104 214 L212 120 M212 120 h-20 M212 120 v20" stroke="#ff7a59" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <Surface material="float" className="fx-pill note-tools" aria-label="Annotation tools">
            {["arrow", "box", "brush", "text"].map((n) => <button key={n} className="tool" aria-label={n} data-active={n === "arrow" ? "" : undefined} type="button" style={{ inlineSize: "1.75rem", blockSize: "1.75rem" }}><Ti n={n} /></button>)}
          </Surface>
        </div>
      </Card>
      <Card name="<CompareSlider />" span={4}>
        <div className="crop">
          <img src={scene.url} alt="" />
          <img src={scene.url} alt="" style={{ filter: GRADE, clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
          <span className="split-line" style={{ left: `${pos}%` }} /><span className="split-knob" style={{ left: `${pos}%` }}><IconColumns /></span>
        </div>
      </Card>
      <Card name="<CurvesEditor />" span={3}><div style={{ flex: 1, minBlockSize: 0, display: "grid", alignItems: "center" }}><CurvesGraph scene={scene} /></div></Card>
      <Card name="<GradientEditor />" span={3}>
        <div className="grad" style={{ marginBlockEnd: ".75rem", marginBlockStart: ".25rem" }}>
          {([[2, "#0f2150"], [45, "#b0668c"], [72, "#f08a5a"], [98, "#ffd38f"]] as const).map(([p, c]) => <span key={p} className="stop" style={{ insetInlineStart: `${p}%`, background: c }} />)}
        </div>
        <Segmented size="sm" block aria-label="Gradient shape" defaultValue="linear" collapse="none" options={[{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }, { value: "angle", label: "Angular" }]} />
        <div className="param"><div><span>Stop position</span><b>72%</b></div><Slider aria-label="Stop position" defaultValue={72} size="sm" bubble="never" /></div>
        <div className="kv"><span>Interpolation</span><b>OKLab</b></div>
        <div className="grad-set" aria-label="Gradient presets">
          {["#0b1026, #6a3d9a, #ff8e53", "#04343f, #1fa2a0, #e9f5db", "#2b1b12, #c2703d, #f7e7ce", "#101820, #7a8896, #f2f4f6", "#3a0c28, #d7263d, #f9c74f", "#0d3b66, #5fa8d3, #faf0ca"].map((g) => <span key={g} style={{ background: `linear-gradient(90deg, ${g})` }} />)}
        </div>
      </Card>
      <Card name="<HistogramView />" span={2}>
        <div style={{ flex: 1, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto auto", gap: "var(--space-2)" }}>
          <div style={{ minBlockSize: 0 }}><Histogram scene={scene} /></div>
          <div className="kv"><span>Mean</span><b>98.4</b></div>
          <div className="kv"><span>Clipped</span><b>0.2%</b></div>
        </div>
      </Card>
    </div>
  );
}

export function PhoneEdit({ scene }: { scene: Scene }) {
  return (
    <div className="ph" data-density="comfortable">
      <div className="ph-top">
        <Button variant="ghost" size="md" icon={<IconArrowLeft />} aria-label="Back" tooltip={false} />
        <span className="ws-grow" />
        <Button variant="ghost" size="md" icon={<IconUndo />} aria-label="Undo" tooltip={false} />
        <Button variant="ghost" size="md" icon={<IconRedo />} aria-label="Redo" tooltip={false} />
        <Button variant="primary" size="sm">Export</Button>
      </div>
      <div className="ph-view"><img src={scene.url} alt="Sample" /><span className="cursor" style={{ left: "58%", top: "42%", width: 52, height: 52 }} /></div>
      <Surface material="chrome" radius="surface" className="ph-ctx">
        <div className="param"><div><span>Brush size</span><b>84 px</b></div><Slider aria-label="Brush size" defaultValue={42} bubble="never" /></div>
        <div className="param"><div><span>Opacity</span><b>65%</b></div><Slider aria-label="Opacity" defaultValue={65} bubble="never" /></div>
      </Surface>
      <div className="ph-tools" role="toolbar" aria-label="Tools">
        {["move", "lasso", "crop", "brush", "eraser", "heal"].map((n) => <button key={n} className="tool" aria-label={n} data-active={n === "brush" ? "" : undefined} type="button"><Ti n={n} /></button>)}
        <button className="tool" aria-label="Layers" type="button"><IconLayers /></button>
      </div>
    </div>
  );
}
export function PhoneLayers({ scene }: { scene: Scene }) {
  return (
    <div className="ph" data-density="comfortable">
      <div className="ph-top">
        <Button variant="ghost" size="md" icon={<IconArrowLeft />} aria-label="Back" tooltip={false} />
        <span className="ws-grow" />
        <Button variant="ghost" size="md" icon={<IconUndo />} aria-label="Undo" tooltip={false} />
        <Button variant="primary" size="sm">Export</Button>
      </div>
      <div className="ph-view" style={{ alignItems: "start", paddingBlockStart: "var(--space-4)" }}><img src={scene.url} alt="Sample" /></div>
      <Surface material="overlay" radius="dialog" className="ph-sheet" role="dialog" aria-label="Layers">
        <div className="ph-grip" />
        <PanelHeader level={3} title="Layers" actions={<Button variant="ghost" size="sm" icon={<IconPlus />} aria-label="New layer" tooltip={false} />} />
        <div style={{ overflow: "hidden" }}>{layerRows(scene).map((l) => <LayerRow key={l.name} l={l} />)}</div>
      </Surface>
    </div>
  );
}

/* A host application's page. Only the window is ours; the library grid and Save belong to the host. */
export function HostWindow({ scene }: { scene: Scene }) {
  const items: Array<[string, string]> = [["Lake lodge, front", ""], ["Boat shed", "hue-rotate(-24deg) saturate(.8)"], ["Jetty at dawn", "brightness(1.12) saturate(.7)"], ["North ridge walk", "sepia(.4)"], ["Reception", "saturate(1.5)"], ["Cabin 4 deck", "contrast(.85)"], ["Fire pit", "hue-rotate(30deg)"], ["Trailhead", "grayscale(.5)"]];
  const tools = [["crop", "Crop"], ["rotate", "Rotate"], ["adjust", "Adjust"], ["heal", "Heal"], ["text", "Text"]] as const;
  return (
    <div className="hw" data-density="compact">
      <header className="hw-head"><b>Listing photos</b><span className="mx-tick">8 photos · Lake lodge</span><span className="ws-grow" /><Button variant="primary" size="sm" icon={<IconPlus />}>Add photo</Button></header>
      <div className="op-grid">{items.map(([n, f]) => <Surface key={n} material="card" radius="tile" className="op-card"><img src={scene.url} alt="" style={{ filter: f }} /><div className="op-meta"><b>{n}</b></div></Surface>)}</div>
      <Surface material="overlay" radius="dialog" className="pe" role="dialog" aria-label="Edit photo">
        <div className="pe-title"><span>Edit photo · Lake lodge, front</span><span className="ws-grow" /><Button variant="ghost" size="xs" icon={<IconUndo />} aria-label="Undo" tooltip={false} /><Button variant="ghost" size="xs" icon={<IconRedo />} aria-label="Redo" tooltip={false} disabled /><Button variant="ghost" size="xs" icon={<IconClose />} aria-label="Close" tooltip={false} /></div>
        <div className="pe-view" data-mode="dark" dir="ltr"><img src={scene.url} alt="Photo being edited" style={{ filter: "brightness(1.05) contrast(1.06) saturate(1.1)" }} /><span className="crop-box" data-grid="" style={{ inlineSize: "78%", aspectRatio: "3 / 2", top: "50%", left: "50%", translate: "-50% -50%" }} /></div>
        <div className="pe-side">
          <div className="pe-tools" role="toolbar" aria-label="Photo tools">{tools.map(([n, label]) => <button key={n} type="button" className="pe-tool" data-active={n === "adjust" ? "" : undefined}><Ti n={n} /><span>{label}</span></button>)}</div>
          {([["Brightness", "+8", 58], ["Contrast", "+6", 56], ["Saturation", "+10", 60], ["Warmth", "+4", 54], ["Sharpen", "12", 12]] as const).map(([n, v, p]) => <div className="param" key={n}><div><span>{n}</span><b>{v}</b></div><Slider aria-label={n} defaultValue={p} size="sm" bubble="never" /></div>)}
          <Button variant="ghost" size="sm" block>Reset</Button>
        </div>
        <div className="pe-foot"><span className="mx-tick">2400 × 1600 · 1.4 MB</span><span className="ws-grow" /><Button variant="secondary" size="sm">Cancel</Button><Button variant="primary" size="sm">Save to listing</Button></div>
      </Surface>
    </div>
  );
}
