import { describe, expect, it } from 'vitest';
import { geometryMapping, geometrySize, homography, normaliseGeometry, rectQuad, workSize, type Point } from '../core/index.js';
import { normaliseRecipe } from '../session/recipe.js';
import { guideLean, guidesInTurned, NEUTRAL_PERSPECTIVE, perspectiveChange, perspectiveOf, perspectiveQuad, PERSPECTIVE, readSettings, solveGuides, type PerspectiveSettings } from './perspective-math.js';

const SIZE = { width: 600, height: 400 };
const width = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const settings = (change: Partial<PerspectiveSettings>): PerspectiveSettings => ({ ...NEUTRAL_PERSPECTIVE, ...change });

describe('perspective quad', () => {
  it('is the picture itself when neutral', () => {
    const quad = perspectiveQuad(SIZE, NEUTRAL_PERSPECTIVE)!;
    rectQuad(SIZE).forEach((p, i) => { expect(quad[i]![0]).toBeCloseTo(p[0], 9); expect(quad[i]![1]).toBeCloseTo(p[1], 9); });
  });

  it('widens the top for negative vertical and the left for negative horizontal', () => {
    const v = perspectiveQuad(SIZE, settings({ vertical: -50 }))!;
    expect(width(v[0], v[1])).toBeGreaterThan(width(v[3], v[2]) * 1.1);
    const h = perspectiveQuad(SIZE, settings({ horizontal: -50 }))!;
    expect(width(h[0], h[3])).toBeGreaterThan(width(h[1], h[2]) * 1.1);
    const flipped = perspectiveQuad(SIZE, settings({ vertical: 50 }))!;
    expect(width(flipped[0], flipped[1])).toBeLessThan(width(flipped[3], flipped[2]));
  });

  it('keeps the centre in place at unit scale, so detail there keeps its resolution', () => {
    const quad = perspectiveQuad(SIZE, settings({ vertical: -60, horizontal: 30, rotate: 4 }))!;
    const map = homography(rectQuad(SIZE), quad), c = map(300, 200)!, e = map(301, 200)!, f = map(300, 201)!;
    expect(c[0]).toBeCloseTo(300, 6); expect(c[1]).toBeCloseTo(200, 6);
    expect(Math.abs((e[0] - c[0]) * (f[1] - c[1]) - (e[1] - c[1]) * (f[0] - c[0]))).toBeCloseTo(1, 4);
  });

  it('stretches with aspect and grows with scale', () => {
    const wide = perspectiveQuad(SIZE, settings({ aspect: 100 }))!;
    expect(width(wide[0], wide[1]) / width(wide[0], wide[3])).toBeCloseTo(600 / 400 * 2, 6);
    const zoomed = perspectiveQuad(SIZE, settings({ scale: 150 }))!;
    expect(width(zoomed[0], zoomed[1])).toBeCloseTo(900, 6);
  });

  it('applies on top of an earlier distortion', () => {
    const base = [[20, 0], [600, 30], [580, 400], [0, 380]] as const;
    expect(perspectiveQuad(SIZE, settings({ base }))).toEqual(base);
  });
});

describe('settings in the recipe', () => {
  it('drops malformed data rather than trusting it', () => {
    expect(readSettings(null)).toBeNull();
    const read = readSettings({ vertical: 500, horizontal: 'x', scale: 20, guides: [{ a: [0, 0], b: [1, 1], axis: 'vertical' }, { a: [0], b: [1, 1], axis: 'vertical' }, { a: [0, 0], b: [1, 1], axis: 'diagonal' }] })!;
    expect(read).toMatchObject({ vertical: 100, horizontal: 0, scale: 100 });
    expect(read.guides).toHaveLength(1);
  });

  it('writes a serialisable distortion that round-trips, and nothing when neutral', () => {
    const recipe = normaliseRecipe();
    const change = perspectiveChange(recipe, SIZE, settings({ vertical: -40, aspect: 10 }))!;
    const next = normaliseRecipe({ ...recipe, ...change });
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
    expect(() => normaliseGeometry(next.geometry)).not.toThrow();
    expect(perspectiveOf(next, SIZE)).toMatchObject({ vertical: -40, aspect: 10 });
    const back = perspectiveChange(next, SIZE, NEUTRAL_PERSPECTIVE)!;
    expect(back.geometry.distort).toBeNull();
    expect(back.filters[PERSPECTIVE]).toBeUndefined();
  });

  it('starts again from the corners when another tool changed them, keeping the guides', () => {
    const guides = [{ a: [10, 10], b: [12, 300], axis: 'vertical' }] as const;
    const recipe = normaliseRecipe({ ...perspectiveChange(normaliseRecipe(), SIZE, settings({ vertical: -40, guides }))! });
    const moved = normaliseRecipe({ ...recipe, geometry: { ...recipe.geometry, distort: [[5, 5], [600, 0], [600, 400], [0, 400]] } });
    const state = perspectiveOf(moved, SIZE);
    expect(state).toMatchObject({ vertical: 0, base: moved.geometry.distort, guides });
  });

  it('keeps the output size as Scale zooms in, and leaves a crop the user drew alone', () => {
    const recipe = normaliseRecipe();
    const plain = normaliseRecipe({ ...recipe, ...perspectiveChange(recipe, SIZE, settings({ vertical: -30 }))! });
    const zoomed = normaliseRecipe({ ...recipe, ...perspectiveChange(plain, SIZE, settings({ vertical: -30, scale: 140 }))! });
    const a = geometrySize(SIZE, plain.geometry), b = geometrySize(SIZE, zoomed.geometry);
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
    expect(zoomed.geometry.crop).not.toBeNull();
    // Back to 100% removes the crop Scale made.
    expect(perspectiveChange(zoomed, SIZE, settings({ vertical: -30 }))!.geometry.crop).toBeNull();
    // A crop drawn by the user stays, clamped into the new bounds.
    const cropped = normaliseRecipe({ ...plain, geometry: { ...plain.geometry, crop: { x: 10, y: 10, width: 100, height: 100 } } });
    const kept = perspectiveChange(cropped, SIZE, settings({ vertical: -10 }))!.geometry.crop!;
    expect(kept).toEqual({ x: 10, y: 10, width: 100, height: 100 });
    expect(kept.x + kept.width).toBeLessThanOrEqual(workSize(SIZE, perspectiveChange(cropped, SIZE, settings({ vertical: -10 }))!.geometry).width);
  });
});

describe('guided correction', () => {
  it('reads lean against the guide axis, either way it was drawn', () => {
    expect(guideLean([0, 0], [0, 100], 'vertical')).toBeCloseTo(0, 9);
    expect(guideLean([0, 100], [0, 0], 'vertical')).toBeCloseTo(0, 9);
    expect(guideLean([0, 0], [100, 10], 'horizontal')).toBeCloseTo(5.71, 2);
    expect(guideLean([100, 10], [0, 0], 'horizontal')).toBeCloseTo(5.71, 2);
  });

  it('makes two converging verticals plumb', () => {
    // In the photo, the scene's verticals at x=100 and x=500 lean towards each other.
    const lean = 8, guides = [
      { a: [100 + Math.tan(lean * Math.PI / 180) * 320, 40] as Point, b: [100, 360] as Point, axis: 'vertical' as const },
      { a: [500 - Math.tan(lean * Math.PI / 180) * 320, 40] as Point, b: [500, 360] as Point, axis: 'vertical' as const },
    ];
    const solved = solveGuides(SIZE, NEUTRAL_PERSPECTIVE, guides);
    expect(solved.vertical).toBeLessThan(0);
    const quad = perspectiveQuad(SIZE, solved)!, map = homography(rectQuad(SIZE), quad);
    for (const g of guides) expect(Math.abs(guideLean(map(...g.a)!, map(...g.b)!, 'vertical'))).toBeLessThan(.2);
  });

  it('solves verticals and horizontals together, including a turn', () => {
    const truth = settings({ vertical: 25, horizontal: -15, rotate: 3 });
    const quad = perspectiveQuad(SIZE, truth)!, inverse = homography(quad, rectQuad(SIZE));
    // Straight lines in the corrected view, carried back to the photo.
    const back = (a: Point, b: Point, axis: 'vertical' | 'horizontal') => ({ a: inverse(...a)!, b: inverse(...b)!, axis });
    const guides = [back([150, 60], [150, 340], 'vertical'), back([450, 60], [450, 340], 'vertical'), back([120, 80], [480, 80], 'horizontal'), back([120, 320], [480, 320], 'horizontal')];
    const solved = solveGuides(SIZE, NEUTRAL_PERSPECTIVE, guides);
    const map = homography(rectQuad(SIZE), perspectiveQuad(SIZE, solved)!);
    for (const g of guides) expect(Math.abs(guideLean(map(...g.a)!, map(...g.b)!, g.axis))).toBeLessThan(.1);
  });

  it('accounts for a free angle applied after perspective', () => {
    const guides = [{ a: [100, 40] as Point, b: [100, 360] as Point, axis: 'vertical' as const }, { a: [500, 40] as Point, b: [500, 360] as Point, axis: 'vertical' as const }];
    const solved = solveGuides(SIZE, NEUTRAL_PERSPECTIVE, guides, 5);
    expect(solved.rotate).toBeCloseTo(-5, 1);
  });

  it('needs two guides', () => {
    const one = [{ a: [100, 40] as Point, b: [120, 360] as Point, axis: 'vertical' as const }];
    expect(solveGuides(SIZE, NEUTRAL_PERSPECTIVE, one)).toBe(NEUTRAL_PERSPECTIVE);
  });

  it('carries guides from source pixels through quarter turns and flips', () => {
    const geometry = normaliseGeometry({ rotation: 90, flipX: true });
    const [g] = guidesInTurned(SIZE, geometry, [{ a: [0, 0], b: [600, 0], axis: 'horizontal' }]);
    const turn = geometryMapping(SIZE, geometry);
    expect(g!.a).toEqual(turn.fromSource(0, 0));
    expect(g!.b).toEqual(turn.fromSource(600, 0));
  });
});
