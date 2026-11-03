import { expect, test } from "@playwright/test";

/**
 * RGBA16F keeps about 3 decimal digits of any value, so this is rounding, not a real difference.
 * The harness measures it relative to values above 1.
 */
const FLOAT_TOLERANCE = 0.002;

test.beforeEach(async ({ page }) => {
  await page.goto("/conformance.html");
  await page.waitForFunction(() => window.conformance);
});

const NAMES = ["filter context", "blend: overlay", "blend: soft-light", "blend: hard-light", "blend: darken", "blend: lighten", "blend: difference", "blend: exclusion", "blend: colour-dodge", "blend: colour-burn", "blend: hue", "blend: saturation", "blend: colour", "blend: luminosity", "one layer", "blur, small", "blur, large", "blur, translucent", "blur twice", "layer opacity", "blend: normal", "blend: multiply", "blend: screen", "adjust: brightness", "adjust: darker", "adjust: contrast", "adjust: flat", "adjust: saturation", "adjust: grey", "adjust: warmth", "adjust: all, translucent", "sharpen", "sharpen, translucent", "adjust then sharpen"];

test("runs on a real WebGL2 context", async ({ page }) => {
  const info = await page.evaluate(() => window.conformance.renderer());
  console.log(`WebGL2 renderer: ${info.renderer}`);
  expect(info.kind).toBe("webgl2");
});

for (const name of NAMES) {
  for (const level of [0, 1, 2]) {
    test(`${name} matches at level ${level}`, async ({ page }) => {
      const { worst, tiles } = await page.evaluate(([n, l]) => window.conformance.difference(n as string, l as number), [name, level]);
      console.log(`${name}, level ${level}: ${worst.toFixed(6)} over ${tiles} tiles`);
      expect(tiles).toBeGreaterThan(0);
      expect(worst).toBeLessThan(FLOAT_TOLERANCE);
    });
  }
}

test("both backends put the same bytes on screen at 100%", async ({ page }) => {
  const { worst, largeShare } = await page.evaluate(() => window.conformance.presentDifference());
  console.log(`Screen difference: ${worst} of 255, ${(largeShare * 100).toFixed(5)}% of bytes above 1`);
  // Half floats round a tile by up to about 0.0005, which can tip a byte over a rounding boundary
  // the other way. One level is routine, two is a rare stack of both. More would be a real bug.
  expect(worst).toBeLessThanOrEqual(2);
  expect(largeShare).toBeLessThan(0.0001);
});

for (const kind of ["webgl2", "cpu"] as const) {
  test(`${kind} shows no seams between tiles at any zoom`, async ({ page }) => {
    const spread = await page.evaluate((k) => window.conformance.seams(k), kind);
    console.log(`${kind} seam spread: ${spread} of 255`);
    expect(spread).toBeLessThanOrEqual(1);
  });
}

test("the harness fails a kernel that drifts by 4%", async ({ page }) => {
  const worst = await page.evaluate(() => window.conformance.brokenKernel());
  console.log(`Broken kernel difference: ${worst.toFixed(6)}`);
  expect(worst).toBeGreaterThan(FLOAT_TOLERANCE);
});

for(const kind of ["webgl2","cpu"] as const) {
  test(`${kind} presents division blends without blank surfaces or seams`,async({page})=>{
    const spread=await page.evaluate(k=>window.conformance.seams(k,"colour-dodge"),kind);
    expect(spread).toBeLessThanOrEqual(1);
  });
}
