import { describe, expect, it } from 'vitest';
import { rectQuad, type LayerSpec, type Quad } from '../core/index.js';
import { constrainDelta, handlePoint, layerAt, layerCopy, neighbourLayer, quadAngle, quadBounds, quadCentre, quadContains, quadSize, resizeCursor, resizeQuad, rotateQuad, rotateZone, scaleQuad, snapAngle, translateQuad } from './select-math.js';

const layer = (id: string, quad: Quad, visible = true): LayerSpec => ({ id, name: id, kind: 'image', visible, opacity: 1, blend: 'normal', quad });
const box = (x: number, y: number, w: number, h: number): Quad => translateQuad(rectQuad({ width: w, height: h }), x, y);
const close = (q: Quad, expected: Quad) => q.forEach((p, i) => { expect(p[0]).toBeCloseTo(expected[i]![0], 6); expect(p[1]).toBeCloseTo(expected[i]![1], 6); });

describe('select hit-testing', () => {
  const layers = [layer('bottom', box(0, 0, 100, 100)), layer('top', box(50, 50, 100, 100)), layer('hidden', box(0, 0, 300, 300), false)];
  it('picks the topmost visible layer under the point, as Auto-Select does', () => {
    expect(layerAt(layers, [75, 75])).toBe('top');
    expect(layerAt(layers, [25, 25])).toBe('bottom');
    expect(layerAt(layers, [250, 250])).toBeNull();
  });
  it('counts the whole box of a turned layer, not only its pixels', () => {
    const turned = rotateQuad(box(0, 0, 100, 20), 45);
    expect(quadContains(turned, quadCentre(turned))).toBe(true);
    expect(quadContains(turned, [0, 0])).toBe(false);
  });
});

describe('select transforms', () => {
  const q = box(10, 20, 100, 50);
  it('moves, and constrains a Shift drag to the nearest axis or diagonal', () => {
    close(translateQuad(q, 5, -3), box(15, 17, 100, 50));
    expect(constrainDelta(10, 2)).toEqual([10, 0]);
    expect(constrainDelta(1, -12)).toEqual([0, -12]);
    expect(constrainDelta(10, 9)).toEqual([9.5, 9.5]);
  });
  it('scales from the opposite corner, or about the centre with Alt', () => {
    close(scaleQuad(q, 'se', [210, 120]), box(10, 20, 200, 100));
    close(scaleQuad(q, 'nw', [-90, -30]), box(-90, -30, 200, 100));
    close(scaleQuad(q, 'se', [160, 95], { fromCentre: true }), box(-40, -5, 200, 100));
  });
  it('keeps proportions with Shift, following the axis dragged further', () => {
    const scaled = scaleQuad(q, 'se', [310, 80], { keepAspect: true });
    expect(quadSize(scaled).width / quadSize(scaled).height).toBeCloseTo(2, 6);
    expect(quadSize(scaled).width).toBeCloseTo(300, 6);
  });
  it('scales one way from an edge handle, both ways about its middle with Shift', () => {
    close(scaleQuad(q, 'e', [160, 999]), box(10, 20, 150, 50));
    const both = scaleQuad(q, 's', [0, 120], { keepAspect: true });
    expect(quadSize(both).width).toBeCloseTo(200, 6);
    expect(quadBounds(both).y).toBeCloseTo(20, 6);
    expect(quadCentre(both)[0]).toBeCloseTo(60, 6);
  });
  it('never flips or collapses a layer', () => {
    const tiny = scaleQuad(q, 'se', [-500, -500], { minSize: 1 });
    expect(quadSize(tiny).width).toBeCloseTo(1, 6);
    expect(quadSize(tiny).height).toBeCloseTo(1, 6);
    expect(quadBounds(tiny).x).toBeCloseTo(10, 6);
  });
  it('scales a turned layer along its own edges', () => {
    const turned = rotateQuad(q, 30), corner = handlePoint(turned, 'se'), centre = quadCentre(turned);
    const scaled = scaleQuad(turned, 'se', [corner[0] + (corner[0] - centre[0]), corner[1] + (corner[1] - centre[1])], { fromCentre: true });
    expect(quadAngle(scaled)).toBeCloseTo(30, 6);
    expect(quadSize(scaled).width).toBeCloseTo(200, 6);
  });
  it('turns about the centre and snaps to fifteen degrees', () => {
    const turned = rotateQuad(q, 90);
    expect(quadAngle(turned)).toBeCloseTo(90, 6);
    expect(quadCentre(turned)[0]).toBeCloseTo(60, 6);
    expect(snapAngle(22)).toBe(15);
    expect(snapAngle(-38)).toBe(-45);
  });
  it('resizes about the centre by separate factors', () => {
    close(resizeQuad(q, 2, 1), box(-40, 20, 200, 50));
  });
  it('places handles on a perspective quad and points their cursors along the pull', () => {
    const p: Quad = [[0, 0], [100, 10], [90, 90], [10, 100]];
    expect(handlePoint(p, 'nw')).toEqual([0, 0]);
    expect(handlePoint(p, 'se')[0]).toBeCloseTo(90, 6);
    expect(resizeCursor(0)).toBe('ew-resize');
    expect(resizeCursor(45)).toBe('nwse-resize');
    expect(resizeCursor(270)).toBe('ns-resize');
    expect(resizeCursor(-45)).toBe('nesw-resize');
  });
  it('builds a rotate zone that stays outside the layer', () => {
    const zone = rotateZone(q, 0, 20);
    expect(zone[0]).toEqual(q[0]);
    for (const p of zone.slice(2, 5)) expect(quadContains(q, p)).toBe(false);
  });
});

describe('select layer helpers', () => {
  it('copies a layer above itself with the strokes painted on it', () => {
    const recipe = { layers: [layer('a', box(0, 0, 10, 10)), layer('b', box(0, 0, 5, 5))], strokes: [{ id: 's', tool: 'brush', params: {}, points: [], layer: 'a' }, { id: 't', tool: 'brush', params: {}, points: [] }] };
    const copy = layerCopy(recipe, 'a', 'copy')!;
    expect(copy.change.layers!.map(l => l.id)).toEqual(['a', 'copy', 'b']);
    expect(copy.change.strokes!.filter(s => s.layer === 'copy')).toHaveLength(1);
    expect(copy.change.strokes!.find(s => s.layer === 'copy')!.id).not.toBe('s');
    expect(layerCopy(recipe, 'missing', 'x')).toBeNull();
  });
  it('steps to the layer above or below, stopping at the ends, from the top when none is chosen', () => {
    const layers = [layer('a', box(0, 0, 1, 1)), layer('hidden', box(0, 0, 1, 1), false), layer('b', box(0, 0, 1, 1)), layer('c', box(0, 0, 1, 1))];
    expect(neighbourLayer(layers, null, -1)).toBe('c');
    expect(neighbourLayer(layers, 'b', 1)).toBe('c');
    expect(neighbourLayer(layers, 'c', 1)).toBe('c');
    expect(neighbourLayer(layers, 'b', -1)).toBe('a');
    expect(neighbourLayer([], null, 1)).toBeNull();
  });
});
