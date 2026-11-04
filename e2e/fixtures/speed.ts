import { expect, test } from "@playwright/test";

/**
 * A frame-time or stall limit. These limits are set on the reference machine (the development server, under
 * SwiftShader), where they gate: a stall there fails the test. Shared hosted runners vary several-fold from one
 * run to the next, so under CI the measurement is logged and attached to the report as an annotation, marked when
 * it is over the limit, and does not fail the test. SwiftShader timings find stalls; they say nothing about real
 * GPU speed. Correctness assertions never go through this.
 */
export function expectTiming(name: string, value: number, limit: number) {
  const line = `${name}: ${value.toFixed(1)} ms (limit ${limit} ms on the reference machine)`;
  console.log(line);
  if (process.env.CI) {
    test.info().annotations.push({ type: value < limit ? "timing" : "timing over limit", description: line });
    return;
  }
  expect(value, name).toBeLessThan(limit);
}
