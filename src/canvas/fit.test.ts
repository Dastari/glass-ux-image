import { expect, it } from 'vitest';
import { fitBox } from './image-canvas.js';
import { autoBins } from '../panels/histogram.js';
import { createImageWorkspace } from '../editor/image-editor.js';

const box = (offsetLeft: number, offsetTop: number, offsetWidth: number, offsetHeight: number) => ({ offsetLeft, offsetTop, offsetWidth, offsetHeight });

it('fits to the clear box when floating panes leave a usable one, else to the whole stage', () => {
  expect(fitBox(1400, 700, null)).toEqual({ x: 0, y: 0, width: 1400, height: 700 });
  expect(fitBox(1400, 700, box(270, 0, 715, 525))).toEqual({ x: 270, y: 0, width: 715, height: 525 });
  // Panes covering nearly everything would squeeze the picture to a sliver: use the stage.
  expect(fitBox(1400, 700, box(600, 0, 200, 700))).toEqual({ x: 0, y: 0, width: 1400, height: 700 });
  expect(fitBox(1400, 700, box(0, 0, 0, 0))).toEqual({ x: 0, y: 0, width: 1400, height: 700 });
});

it('picks histogram bins about 7 px apart, in steps of 8', () => {
  expect(autoBins(340)).toBe(48);
  expect(autoBins(0)).toBe(32);
  expect(autoBins(60)).toBe(16);
  expect(autoBins(4000)).toBe(128);
});

it('puts the library in its own column or in a tab beside develop', () => {
  const ids = (layout: unknown) => [...new Set(JSON.stringify(layout).match(/"(left|stage|right|bottom)"/g))];
  expect(ids(createImageWorkspace({ filmstrip: false }).layout)).toEqual(['"left"', '"stage"', '"right"']);
  expect(ids(createImageWorkspace({ filmstrip: false, library: 'tab' }).layout)).toEqual(['"stage"', '"right"', '"left"']);
});
