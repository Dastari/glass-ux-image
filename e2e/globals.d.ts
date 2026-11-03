/* The conformance page's API, typed here because tests run in Node and cannot import the page. */
interface ConformanceHarness {
  renderer(): { kind: string; renderer?: string };
  difference(name: string, level: number): Promise<{ worst: number; tiles: number }>;
  presentDifference(): Promise<{ worst: number; largeShare: number }>;
  seams(kind: "webgl2" | "cpu", blend?: "colour-dodge"): Promise<number>;
  brokenKernel(): Promise<number>;
}

interface Window {
  conformance: ConformanceHarness;
}

interface Window {
  foundation: {
    session: import("../src/session/session.js").EditorSession;
    exportBoth(): Promise<number[][]>;
    pointerSession: import("../src/session/session.js").EditorSession;
  };
}
