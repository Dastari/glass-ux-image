import type { CSSProperties, ReactNode } from "react";
import { Badge } from "glass-ux/badge";
import { Button } from "glass-ux/button";
import { Select } from "glass-ux/select";
import { Slider } from "glass-ux/slider";
import { Surface, Panel, PanelHeader } from "glass-ux/surface";
import { Segmented } from "glass-ux/segmented";
import { IconEye, IconEyeOff, IconEyedropper, IconLock, IconMoreHorizontal, IconPlus, IconRedo, IconSearch, IconTrash, IconUndo, IconZoomIn, IconChevronDown, IconSettings } from "glass-ux/icons";
import { Ti } from "./icons";
import { t, lang } from "./i18n";
import type { Scene } from "./scene";

export const BLEND = ["Normal", "Multiply", "Screen", "Overlay", "Soft light", "Hard light", "Colour dodge", "Colour burn", "Luminosity"].map((m) => ({ value: m, label: t(m) }));

const TOOLS: Array<Array<{ n?: string; label: string; key: string; more?: boolean; el?: ReactNode }>> = [
  [{ n: "move", label: "Move", key: "V" }, { n: "marquee", label: "Marquee", key: "M", more: true }, { n: "lasso", label: "Lasso", key: "L", more: true }, { n: "wand", label: "Magic wand", key: "W" }, { n: "crop", label: "Crop", key: "C" }, { n: "transform", label: "Transform", key: "T" }],
  [{ n: "brush", label: "Brush", key: "B", more: true }, { n: "eraser", label: "Eraser", key: "E" }, { n: "fill", label: "Fill", key: "G", more: true }, { n: "gradient", label: "Gradient", key: "D" }, { label: "Eyedropper", key: "I", el: <IconEyedropper /> }],
  [{ n: "clone", label: "Clone", key: "S" }, { n: "heal", label: "Heal", key: "J" }, { n: "dodge", label: "Dodge and burn", key: "O", more: true }, { n: "smudge", label: "Smudge", key: "R", more: true }],
  [{ n: "text", label: "Text", key: "X" }, { n: "shape", label: "Shapes", key: "U", more: true }, { n: "pen", label: "Pen", key: "P" }],
  [{ n: "hand", label: "Hand", key: "H" }, { label: "Zoom", key: "Z", el: <IconZoomIn /> }],
];

export function ToolRail({ active = "brush" }: { active?: string }) {
  return (
    <Surface as="nav" aria-label="Tools" material="chrome" radius="tile" className="ws-rail" role="toolbar" aria-orientation="vertical">
      {TOOLS.map((group, i) => (
        <div key={i} style={{ display: "contents" }}>
          {i > 0 && <span className="ws-rule" />}
          {group.map((tool) => (
            <button key={tool.label} type="button" className="tool" aria-label={`${tool.label} (${tool.key})`} aria-pressed={tool.n === active} data-active={tool.n === active ? "" : undefined} data-more={tool.more ? "" : undefined}>
              {tool.n ? <Ti n={tool.n} /> : tool.el}
            </button>
          ))}
        </div>
      ))}
      <span className="ws-grow" />
      <div className="chips" aria-label="Foreground and background colour">
        <span className="chip" style={{ insetBlockEnd: 0, insetInlineEnd: 0, background: "#f4efe6" }} />
        <span className="chip" style={{ insetBlockStart: 0, insetInlineStart: 0, background: "#e8875a" }} />
      </div>
    </Surface>
  );
}

export function TopBar({ options, undoLabel = "Curves" }: { options?: ReactNode; undoLabel?: string }) {
  return (
    <Surface as="header" material="chrome" radius="tile" className="ws-top">
      <div className="ws-row">
        {["File", "Edit", "Image", "Layer", "Select", "Filter", "View", "Window", "Help"].map((m) => <button key={m} className="ws-menu" type="button">{t(m)}</button>)}
        <span className="ws-grow" />
        <span className="mx-tick" style={{ marginInlineEnd: "var(--space-2)" }} dir="auto">lake-at-dusk.guxi</span>
        <Badge tone="neutral" size="sm" marker="dot">{t("Saved")}</Badge>
        <span className="ws-grow" />
        <Button variant="ghost" size="sm" icon={<IconUndo />} aria-label={`Undo ${undoLabel}`} tooltip={false} />
        <Button variant="ghost" size="sm" icon={<IconRedo />} aria-label="Redo" tooltip={false} disabled />
        <Button variant="ghost" size="sm" icon={<IconSearch />} aria-label="Command palette" tooltip={false} />
        <Button variant="primary" size="sm">{t("Export")}</Button>
      </div>
      {options && <div className="ws-row">{options}</div>}
    </Surface>
  );
}

export function BrushOptions() {
  const S = ({ label, value, unit = "%", max = 100 }: { label: string; value: number; unit?: string; max?: number }) => (
    <span className="opt">
      {t(label)}
      <span className="opt-slider"><Slider aria-label={label} defaultValue={value} max={max} size="sm" bubble="never" /></span>
      <span className="mx-num" style={{ color: "var(--fg)", minInlineSize: "2.5rem" }}>{value}{unit === "%" ? "%" : ` ${t(unit)}`}</span>
    </span>
  );
  return (
    <>
      <span className="tool" data-active="" style={{ background: "var(--fill-hover)", color: "var(--fg)" }}><Ti n="brush" /></span>
      <Button variant="ghost" size="xs" iconEnd={<IconChevronDown />}>{t("Soft round")}</Button>
      <span className="ws-rule" style={{ inlineSize: 0, blockSize: "1.25rem", borderInlineStart: "var(--divider)", borderBlockStart: 0, marginInline: "var(--space-1)" }} />
      <S label="Size" value={84} unit="px" max={400} />
      <S label="Hardness" value={30} />
      <S label="Opacity" value={65} />
      <S label="Flow" value={40} />
      <span className="opt">{t("Mode")} <Select aria-label="Brush blend mode" size="sm" options={BLEND} defaultValue="Normal" width="short" /></span>
      <span className="ws-grow" />
      <Button variant="ghost" size="sm" icon={<IconSettings />} aria-label="Brush settings" tooltip={false} />
    </>
  );
}

export function Stage({ scene, children, zoom = "48.2%", bar = true, style }: { scene: Scene; children?: ReactNode; zoom?: string; bar?: boolean; style?: CSSProperties }) {
  const ticks = [0, 1000, 2000, 3000, 4000, 5000, 6000];
  return (
    <section className="stage" aria-label="Canvas" dir="ltr" data-mode="dark" style={style}>
      <div className="corner" />
      <div className="ruler ruler-x">{ticks.map((v, i) => <span key={v} style={{ left: `${6 + i * 14.6}%` }}>{v}</span>)}</div>
      <div className="ruler ruler-y">{[0, 1000, 2000, 3000, 4000].map((v, i) => <span key={v} style={{ top: `${5 + i * 21}%` }}>{v}</span>)}</div>
      <div className="view">
        <div className="art">
          <img src={scene.url} alt="Sample: alpine lake at dusk" />
          {children}
        </div>
      </div>
      {bar && (
        <div className="bar">
          <span><b className="mx-num">{zoom}</b></span>
          <span className="mx-num">6000 × 4000 px</span>
          <span>16-bit float · Display P3</span>
          <span className="mx-num">X 3 912 · Y 1 438</span>
          <span className="ws-grow" />
          <span className="mx-num">2.1 GB tiles · 412 MB GPU</span>
          <span><i className="dot" />WebGL2 · ANGLE</span>
        </div>
      )}
    </section>
  );
}

export function Selection() {
  const d = "M58 10 C70 7 88 12 92 24 C96 36 84 50 70 47 C58 45 46 42 46 28 C46 19 50 13 58 10 Z";
  return (
    <svg className="ants" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path className="a" d={d} /><path className="b" d={d} />
    </svg>
  );
}

function area(values: number[], w: number, h: number) {
  const smooth = values.map((_, i) => { let s = 0, n = 0; for (let k = -1; k <= 1; k++) { const v = values[i + k]; if (v !== undefined) { s += v; n++; } } return s / n; });
  const sorted = [...smooth].sort((a, b) => a - b);
  const max = sorted[Math.floor(sorted.length * 0.985)]! || 1;
  const pts = smooth.map((v, i) => `${(i / (values.length - 1)) * w},${h - Math.min(1, Math.sqrt(v / max)) * h}`);
  return `M0,${h} L${pts.join(" ")} L${w},${h} Z`;
}
export function Histogram({ scene, h = 88, w = 280, mono = false }: { scene: Scene; h?: number; w?: number; mono?: boolean }) {
  const { r, g, b } = scene.histogram;
  if (mono) return <path d={area(r.map((v, i) => v + g[i]! + b[i]!), w, h)} fill="currentColor" opacity={0.14} />;
  return (
    <svg className="hist" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Histogram of the composite image">
      <path d={area(r, w, h)} fill="oklch(0.62 0.2 25 / .85)" /><path d={area(g, w, h)} fill="oklch(0.65 0.17 150 / .85)" /><path d={area(b, w, h)} fill="oklch(0.6 0.17 255 / .85)" />
    </svg>
  );
}
export function HistogramPanel({ scene }: { scene: Scene }) {
  return (
    <Panel>
      <PanelHeader level={3} title={t("Histogram")} actions={<Button variant="ghost" size="xs" icon={<IconMoreHorizontal />} aria-label="Histogram options" tooltip={false} />} />
      <div className="pane-body"><Histogram scene={scene} /></div>
    </Panel>
  );
}

type L = { name: string; meta?: string; thumb?: ReactNode; mask?: boolean; on?: boolean; child?: boolean; active?: boolean; lock?: boolean };
export function layerRows(scene: Scene): L[] {
  const img = (f?: string) => <span className="thumb" style={{ backgroundImage: `url(${scene.url})`, filter: f }} />;
  return [
    { name: t("Grade"), meta: t("Group"), thumb: <span className="thumb" data-square><Ti n="group" /></span> },
    { name: t("Curves"), meta: t("Normal"), thumb: <span className="thumb" data-square><Ti n="curves" /></span>, child: true, mask: true },
    { name: t("Colour balance"), meta: "52%", thumb: <span className="thumb" data-square><Ti n="adjust" /></span>, child: true, on: false },
    { name: t("Sun glow"), meta: t("Screen"), thumb: <span className="thumb" style={{ background: "radial-gradient(circle at 62% 58%, #ffe3b0, #000 60%)" }} /> },
    { name: t("Title"), meta: "Inter 96", thumb: <span className="thumb" data-square><Ti n="text" /></span> },
    { name: t("Retouch"), meta: "65%", thumb: img("brightness(1.1)"), mask: true, active: true },
    { name: t("Background"), thumb: img(), lock: true },
  ];
}
export function LayerRow({ l }: { l: L }) {
  return (
    <div className="layer" role="row" data-active={l.active ? "" : undefined} data-child={l.child ? "" : undefined} aria-selected={l.active}>
      <button className="eye" aria-label={`${l.on === false ? "Show" : "Hide"} ${l.name}`} type="button">{l.on === false ? <IconEyeOff /> : <IconEye />}</button>
      {l.thumb}
      {l.mask && <span className="thumb" data-square style={{ background: "radial-gradient(circle, #eee 35%, #111 70%)" }} />}
      <span className="layer-name" style={l.on === false ? { color: "var(--fg-muted)" } : undefined}>{l.name}</span>
      {l.lock ? <span className="eye"><IconLock /></span> : <span className="layer-meta mx-num">{l.meta}</span>}
    </div>
  );
}
export function LayersPanel({ scene }: { scene: Scene }) {
  return (
    <Panel style={{ flex: "1 1 auto", minBlockSize: 0, display: "flex", flexDirection: "column" }}>
      <PanelHeader level={3} title={t("Layers")} actions={<Segmented size="sm" aria-label="Panel" defaultValue="layers" options={[{ value: "layers", label: t("Layers") }, { value: "history", label: t("History") }]} collapse="none" />} />
      <div className="layers-tools">
        <Select aria-label="Blend mode" size="sm" options={BLEND} defaultValue="Normal" />
        <span className="opt mx-num">{t("Opacity")} <b style={{ color: "var(--fg)", fontWeight: 500 }}>65%</b></span>
      </div>
      <div role="treegrid" aria-label="Layers" style={{ display: "grid", gap: "1px", overflow: "hidden" }}>
        {layerRows(scene).map((l) => <LayerRow key={l.name} l={l} />)}
      </div>
      <div className="pane-foot">
        <Button variant="ghost" size="xs" icon={<Ti n="adjust" />} aria-label="Add adjustment layer" tooltip={false} />
        <Button variant="ghost" size="xs" icon={<Ti n="mask" />} aria-label="Add mask" tooltip={false} />
        <Button variant="ghost" size="xs" icon={<Ti n="group" />} aria-label="Group" tooltip={false} />
        <span className="ws-grow" />
        <Button variant="ghost" size="xs" icon={<IconPlus />} aria-label="New layer" tooltip={false} />
        <Button variant="ghost" size="xs" icon={<IconTrash />} aria-label="Delete layer" tooltip={false} />
      </div>
    </Panel>
  );
}

/* Catmull-Rom through the points, as a Bézier path: no kink at a control point. */
export function curvePath(points: Array<[number, number]>, size = 256) {
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  const px = ([x, y]: [number, number]) => `${x * size},${size - y * size}`;
  let d = `M${px(at(0))}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += ` C${px([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${px([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${px(p2)}`;
  }
  return d;
}
export const CURVE: Array<[number, number]> = [[0, 0.03], [0.26, 0.2], [0.68, 0.79], [1, 1]];
export function CurvesGraph({ scene }: { scene: Scene }) {
  return (
    <svg className="curves" viewBox="-9 -9 274 274" role="application" aria-label="Tone curve, RGB channel. Arrow keys move the selected point.">
      <Histogram scene={scene} h={256} w={256} mono />
      {[64, 128, 192].map((p) => <g key={p} stroke="var(--line)" strokeWidth="1"><path d={`M${p} 0V256M0 ${p}H256`} /></g>)}
      <path d="M0 256L256 0" stroke="var(--line-strong)" strokeWidth="1" />
      <path d={curvePath(CURVE)} fill="none" stroke="var(--fg)" strokeWidth="2" />
      {CURVE.map(([x, y], i) => <circle key={i} cx={x * 256} cy={256 - y * 256} r={i === 2 ? 6 : 5} fill={i === 2 ? "var(--accent)" : "var(--canvas)"} stroke="var(--fg)" strokeWidth="2" />)}
    </svg>
  );
}
