import { expect, test } from '@playwright/test';
const IDS = ['effects-stack', 'gaussian-blur', 'motion-blur', 'radial-blur', 'lens-blur', 'tilt-shift', 'unsharp-mask', 'high-pass', 'detail-enhancement', 'oil-painting', 'pencil-sketch', 'watercolour', 'cartoon', 'sepia', 'film-grain', 'faded', 'bloom', 'glow', 'lens-flare', 'vignette', 'pixelate', 'mosaic', 'halftone', 'add-noise', 'reduce-noise', 'remove-grain', 'posterise', 'threshold', 'solarise', 'emboss', 'lut-grading'];
test.beforeEach(async ({ page }) => { await page.goto('/conformance.html'); await page.waitForFunction(() => window.conformance); });
for (const id of IDS)
    for (const level of [0, 1, 2])
        test(`${id} matches at level ${level}`, async ({ page }) => {
            const { worst, tiles } = await page.evaluate(([id, l]) => window.conformance.difference(`effects: ${id}`, Number(l)), [id, level]);
            console.log(`${id} level ${level}: ${worst}`);
            expect(tiles).toBeGreaterThan(0);
            expect(worst).toBeLessThan(.002);
        });
for (const kind of ['cpu', 'webgl2'] as const)
    for (const level of [0, 1, 2])
        test(`${kind} anchored effects have no tile seams at level ${level}`, async ({ page }) => { const worst = await page.evaluate(([kind, level]) => window.effectsConformance.seams(kind as 'cpu' | 'webgl2', Number(level)), [kind, level]); expect(worst).toBeLessThan(.002); });
declare global {
    interface Window {
        effectsConformance: {
            names: string[];
            seams: (kind: 'cpu' | 'webgl2', level: number) => Promise<number>;
        };
    }
}
