import type { DataTexture, FilterPass } from '../../core/filter.js';
import { applyLevels, bakeTable, clamp, curveSpline, hslToRgb, kelvinTintToGains, linear, luminance, perceptual, rgbToHsl, smooth, tableSample, type Triple } from './maths.js';
import { COLOUR_RANGES, NEUTRAL, type DevelopParams } from './params.js';
import { pointGlsl } from './shaders.js';

const channels = ['red', 'green', 'blue'] as const;
/** Eight overlapping raised-cosine colour ranges, sampled to a periodic float table.
 * Hue deltas reach ±30 degrees, saturation ±100%, lightness ±0.25.
 */
export function bakeHsl(p: DevelopParams['hsl']): DataTexture {
  const centres = [0, 30, 60, 120, 180, 240, 275, 315].map(x => x / 360);
  const f = (channel: number) => (h: number) => {
    let sum = 0, weight = 0;
    for (let i = 0; i < centres.length; i++) {
      const distance = Math.abs(h - centres[i]!); const d = Math.min(distance, 1 - distance);
      const w = d < 1/6 ? (1 + Math.cos(d * 6 * Math.PI)) / 2 : 0;
      const range = p[COLOUR_RANGES[i]!]!;
      sum += w * [range.hue / 1200, range.saturation / 100, range.luminance / 400][channel]!;
      weight += w;
    }
    return weight ? sum / weight : 0;
  };
  return bakeTable([f(0), f(1), f(2)], 361);
}
/** Bake the develop tone mapping into channel lookup tables for matching CPU and GLSL sampling. */
export function bakeTone(p: DevelopParams): DataTexture {
  const master = curveSpline(p.curves.rgb);
  return bakeTable(channels.map(channel => {
    const curve = curveSpline(p.curves[channel]);
    return x => curve(master(applyLevels(applyLevels(x, p.levels.rgb), p.levels[channel])));
  }));
}
export function pointPass(p: DevelopParams): FilterPass | undefined {
  const toneActive = (['rgb', ...channels] as const).some(c =>
    Object.keys(NEUTRAL.levels.rgb).some(k => p.levels[c][k as keyof typeof p.levels.rgb] !== NEUTRAL.levels.rgb[k as keyof typeof p.levels.rgb]) ||
    p.curves[c][0]?.[0] !== 0 || p.curves[c].at(-1)?.[0] !== 1 || p.curves[c].some(([x,y]) => x !== y));
  const hslActive = COLOUR_RANGES.some(c => Object.values(p.hsl[c]).some(Boolean));
  const scalarKeys = ['exposure','brightness','contrast','highlights','shadows','whites','blacks','temperature','tint','saturation','vibrance','hueShift'] as const;
  const balanceActive = Object.values(p.colourBalance).some(v => v.some(Boolean));
  if (!toneActive && !hslActive && !balanceActive && !scalarKeys.some(k => p[k])) return undefined;
  const tone = bakeTone(p), hslTable = bakeHsl(p.hsl);
  const gains = kelvinTintToGains(6500 * 2 ** (p.temperature / 100), p.tint);
  const exposure = 2 ** p.exposure, contrast = 2 ** (p.contrast / 100);
  const u = {
    uExposure: exposure, uGains: gains, uBrightness: p.brightness / 100, uContrast: contrast,
    uHighlights: p.highlights / 100, uShadows: p.shadows / 100, uWhites: p.whites / 100, uBlacks: p.blacks / 100,
    uSaturation: 1 + p.saturation / 100, uVibrance: p.vibrance / 100, uHue: p.hueShift / 360,
    uBalanceS: p.colourBalance.shadows.map(x => x / 400), uBalanceM: p.colourBalance.midtones.map(x => x / 400), uBalanceH: p.colourBalance.highlights.map(x => x / 400),
    uUseTone: Number(toneActive), uUseHsl: Number(hslActive),
  };
  return {
    id: 'develop-tone-colour', glsl: pointGlsl, uniforms: u, textures: { uTone: tone, uHsl: hslTable },
    cpu(source, target, context) {
      const toneTexture = context.textures.uTone!, hslTexture = context.textures.uHsl!;
      for (let i = 0; i < source.data.length; i += 4) {
        const alpha = source.data[i + 3]!;
        target.data[i + 3] = alpha;
        if (alpha <= 0) { target.data.fill(0, i, i + 4); continue; }
        let c = channels.map((_, j) => perceptual(source.data[i + j]! / alpha * exposure * gains[j]!)) as unknown as Triple;
        const l = luminance(c), sh = 1 - smooth(0, 0.65, l), hi = smooth(0.35, 1, l);
        const delta = u.uBrightness * 0.25 + u.uShadows * sh * 0.25 + u.uHighlights * hi * 0.25 + u.uWhites * smooth(0.65, 1, l) * 0.25 + u.uBlacks * (1 - smooth(0, 0.35, l)) * 0.2;
        c = c.map((v,j) => {
          const value = Math.max(0, 0.46135613 + (v - 0.46135613) * contrast + delta);
          const balanced = Math.max(0, value + u.uBalanceS[j]! * sh + u.uBalanceM[j]! * (1-sh)*(1-hi)*4 + u.uBalanceH[j]! * hi);
          return toneActive ? tableSample(toneTexture, balanced, j) : balanced;
        }) as unknown as Triple;
        const peak = Math.max(1, ...c), hsl = rgbToHsl(c.map(x => x / peak) as unknown as Triple);
        const skinDistance = Math.abs(hsl[0] - 0.08);
        const skin = 1 - smooth(0.04, 0.13, Math.min(skinDistance, 1 - skinDistance));
        const sat = Math.max(0, u.uSaturation + u.uVibrance * (1-hsl[1]) * (1-0.8*skin));
        const adj = [0,1,2].map(j => hslActive ? tableSample(hslTexture, hsl[0], j) * smooth(0.02, 0.12, clamp(hsl[1]*sat)) : 0);
        const rgb = hslToRgb([hsl[0] + u.uHue + adj[0]!, clamp(clamp(hsl[1]*sat)*(1+adj[1]!)), clamp(hsl[2]+adj[2]!)]);
        for (let j = 0; j < 3; j++) target.data[i+j] = linear(rgb[j]! * peak) * alpha;
      }
    },
  };
}
