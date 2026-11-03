/* A generated landscape, so the demo carries no third-party imagery. */
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), fx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}
function fbm(x: number, y: number, octaves = 5) {
  let sum = 0, amp = 0.5;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x, y);
    x = x * 2.03 + 11.3;
    y = y * 2.03 + 7.1;
    amp *= 0.5;
  }
  return sum;
}
type RGB = [number, number, number];
const mixc = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;

const HORIZON = 0.665;
const SUN = { u: 0.63, v: 0.585 };
const STOPS: Array<[number, RGB]> = [
  [0, hex("#0f2150")], [0.38, hex("#3c4a8e")], [0.68, hex("#b0668c")],
  [0.86, hex("#f08a5a")], [1, hex("#ffd38f")],
];
function sky(u: number, v: number): RGB {
  const t = clamp(v / HORIZON);
  let c = STOPS[0]![1];
  for (let i = 1; i < STOPS.length; i++) {
    const [a, ca] = STOPS[i - 1]!, [b, cb] = STOPS[i]!;
    if (t >= a && t <= b) c = mixc(ca, cb, smooth((t - a) / (b - a)));
  }
  const d = Math.hypot((u - SUN.u) * 1.5, v - SUN.v);
  c = mixc(c, hex("#fff0c4"), clamp(Math.exp(-d * 9)) * 0.85);
  const cloud = smooth(clamp((fbm(u * 3.2 + 2, v * 12) - 0.47) * 4.5)) * clamp(1.15 - t * 0.55);
  const lit = mixc(hex("#39346f"), hex("#ffae7c"), smooth(clamp(t * 1.1 - 0.18)));
  return mixc(c, lit, cloud * 0.82);
}
const ridge = (u: number, seed: number, base: number, amp: number, freq: number) => {
  const n = fbm(u * freq + seed, seed * 2.1, 6);
  const sharp = 1 - Math.abs(2 * fbm(u * freq * 0.55 + seed * 3, seed, 4) - 1);
  return base - amp * (n * 0.55 + sharp * sharp * 0.8);
};
function land(u: number, v: number): RGB | null {
  const far = ridge(u, 3.2, 0.66, 0.2, 2.6);
  const mid = ridge(u, 7.7, 0.675, 0.17, 3.8);
  const near = ridge(u, 13.1, 0.69, 0.1, 6.2);
  if (v > near) {
    const trees = fbm(u * 60, v * 34, 3);
    return mixc(hex("#101a26"), hex("#22331f"), trees * 0.7 * clamp((v - near) * 18 + 0.3));
  }
  if (v > mid) {
    const shade = fbm(u * 16 + v * 8, v * 18, 4);
    const lit = clamp(0.75 - Math.abs(u - SUN.u) * 1.4);
    return mixc(hex("#26304f"), hex("#6d4a5f"), shade * lit);
  }
  if (v > far) {
    const f = fbm(u * 18 + v * 6, v * 30, 5);
    const snow = smooth(clamp((far + 0.075 - v) * 18)) * smooth(clamp((f - 0.36) * 8));
    const rock = mixc(hex("#4b5688"), hex("#8a6a8c"), f);
    return mixc(rock, hex("#ffd9c2"), snow * 0.9);
  }
  return null;
}
const above = (u: number, v: number): RGB => land(u, v) ?? sky(u, v);
const pines: Array<[number, number, number]> = [
  [0.03, 0.36, 0.075], [0.09, 0.47, 0.06], [0.145, 0.6, 0.05], [0.002, 0.52, 0.08],
  [0.97, 0.42, 0.07], [0.915, 0.56, 0.055], [1.01, 0.3, 0.08],
];
function pine(u: number, v: number) {
  for (const [x, top, w] of pines) {
    if (v < top) continue;
    const t = (v - top) / (1 - top);
    const tier = 1 - ((t * 11) % 1) * 0.42;
    if (Math.abs(u - x) < w * t * tier * (0.85 + noise(u * 90, v * 90) * 0.32)) return true;
  }
  return false;
}
export function pixel(u: number, v: number): RGB {
  const shore = 0.915 + fbm(u * 7, 1.3, 4) * 0.08 - Math.abs(u - 0.55) * -0.03;
  if (pine(u, v)) return mixc(hex("#070c10"), hex("#141d19"), noise(u * 70, v * 70));
  if (v > shore) return mixc(hex("#0a0f12"), hex("#2a2622"), fbm(u * 45, v * 45, 3) * 0.75);
  if (v > HORIZON) {
    const depth = (v - HORIZON) / (1 - HORIZON);
    const ripple = (fbm(u * 5, v * 90, 3) - 0.5) * (0.012 + depth * 0.05);
    const c = above(u + ripple, HORIZON - (v - HORIZON) * 0.9 + ripple * 0.5);
    const glint = Math.exp(-Math.pow((u - SUN.u + ripple * 3) * 14, 2)) * smooth(clamp(fbm(u * 26, v * 120, 3) * 2.1 - 0.72));
    return mixc(mixc(c, hex("#14233f"), 0.2 + depth * 0.35), hex("#ffe0ac"), glint * 0.8);
  }
  return above(u, v);
}

